import { Hono } from 'hono';
import { prisma } from '@whalescope/db';
import { ROUTES_CONFIG } from '../lib/config';
import { MS_PER_HOUR, MS_PER_DAY } from '../lib/constants';
import axios from 'axios';

const strategies = new Hono();

// Helper: Fetch current prices from Gamma API
async function fetchCurrentPrices(slugs: string[]): Promise<Map<string, { price: number; outcome: string }[]>> {
    const priceMap = new Map<string, { price: number; outcome: string }[]>();
    if (slugs.length === 0) return priceMap;
    
    try {
        // Batch fetch - Gamma API supports multiple slugs
        const uniqueSlugs = [...new Set(slugs)];
        const promises = uniqueSlugs.slice(0, 20).map(async (slug) => {
            try {
                const res = await axios.get('https://gamma-api.polymarket.com/markets', {
                    params: { slug },
                    timeout: 3000
                });
                if (res.data && res.data.length > 0) {
                    const market = res.data[0];
                    const prices: { price: number; outcome: string }[] = [];
                    if (market.outcomePrices && market.outcomes) {
                        const priceArr = JSON.parse(market.outcomePrices);
                        const outcomes = JSON.parse(market.outcomes);
                        for (let i = 0; i < outcomes.length; i++) {
                            prices.push({ outcome: outcomes[i], price: Number(priceArr[i]) || 0 });
                        }
                    }
                    priceMap.set(slug, prices);
                }
            } catch { /* ignore individual failures */ }
        });
        await Promise.allSettled(promises);
    } catch { /* ignore batch failure */ }
    
    return priceMap;
}

// GET /stats - Dashboard Agreggates
strategies.get('/stats', async (c) => {
    try {
        // Active Positions Count
        const activePositions = await prisma.paperPosition.count({
            where: { status: 'OPEN' }
        });

        // Global Closed PnL
        const closedStats = await prisma.paperPosition.aggregate({
            where: { status: { startsWith: 'CLOSED' } },
            _sum: { pnl: true },
            _count: true
        });

        const totalPnL = closedStats._sum.pnl || 0;
        const totalClosed = closedStats._count;

        // Calculate Global Winrate
        const wins = await prisma.paperPosition.count({
            where: { status: { startsWith: 'CLOSED' }, pnl: { gt: 0 } }
        });

        const winrate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;

        return c.json({
            activePositions,
            netPnL: Number(totalPnL.toFixed(2)), // Ensure 2 decimals
            winRate: Math.round(winrate),
            totalTrades: totalClosed
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// GET / - List Strategies
strategies.get('/', async (c) => {
    try {
        const list = await prisma.strategy.findMany({
            orderBy: { name: 'asc' }
        });

        // Map to include calculated PnL from balance change (more accurate than position.pnl)
        const result = list.map(s => {
            // Balance-based PnL is source of truth (handles legacy data with pnl=0)
            const balancePnL = s.currentBalance - s.initialBudget;
            return {
                ...s,
                totalPnL: Number(balancePnL.toFixed(2))
            };
        });

        return c.json(result);
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// GET /positions - List Positions (supports ?status=OPEN or ?status=CLOSED filter)
strategies.get('/positions', async (c) => {
    try {
        const statusFilter = c.req.query('status'); // 'OPEN', 'CLOSED', or undefined (all)

        // Build where clause - CLOSED matches all CLOSED_* statuses
        let whereClause = undefined;
        if (statusFilter === 'OPEN') {
            whereClause = { status: 'OPEN' };
        } else if (statusFilter === 'CLOSED') {
            whereClause = { status: { startsWith: 'CLOSED' } };
        } else if (statusFilter) {
            // Exact match for specific status like CLOSED_TP
            whereClause = { status: statusFilter };
        }

        const positions = await prisma.paperPosition.findMany({
            where: whereClause,
            take: ROUTES_CONFIG.DEFAULT_POSITIONS_LIMIT,
            orderBy: [
                { openedAt: 'desc' }    // Newest first
            ],
            include: {
                strategy: { select: { name: true } },
                signal: { select: { aiScore: true } }  // Include score for transparency
            }
        });
        
        // Enrich OPEN positions with live prices
        if (statusFilter === 'OPEN' || !statusFilter) {
            const openPositions = positions.filter(p => p.status === 'OPEN');
            const slugs = openPositions.map(p => p.marketSlug);
            const priceMap = await fetchCurrentPrices(slugs);
            
            // Calculate currentPrice and unrealizedPnl for each position
            const enrichedPositions = positions.map(p => {
                if (p.status !== 'OPEN') return p;
                
                const marketPrices = priceMap.get(p.marketSlug);
                let currentPrice = 0;
                if (marketPrices) {
                    const match = marketPrices.find(mp => 
                        mp.outcome.toLowerCase() === p.outcome.toLowerCase()
                    );
                    if (match) currentPrice = match.price;
                }
                
                // Calculate unrealized PnL
                // shares = amountUSD / entryPrice (after slippage)
                const effectiveEntry = p.entryPrice * (1 + (p.entrySlippage || 0) / p.amountUSD);
                const shares = p.amountUSD / effectiveEntry;
                const currentValue = shares * currentPrice;
                const unrealizedPnl = currentValue - p.amountUSD;
                
                return {
                    ...p,
                    currentPrice,
                    unrealizedPnl: Number(unrealizedPnl.toFixed(2))
                };
            });
            
            return c.json(enrichedPositions);
        }
        
        return c.json(positions);
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// GET /analytics - Hedge Fund Style Analytics
strategies.get('/analytics', async (c) => {
    try {
        // Fetch all closed positions for analysis
        const closedPositions = await prisma.paperPosition.findMany({
            where: { status: { startsWith: 'CLOSED' } },
            select: {
                entryPrice: true,
                exitPrice: true,
                pnl: true,
                openedAt: true,
                closedAt: true
            }
        });

        // 1. RISK PROFILE: Win rate by entry price bucket
        const buckets = [
            { label: '0-0.2', min: 0, max: 0.2 },
            { label: '0.2-0.4', min: 0.2, max: 0.4 },
            { label: '0.4-0.6', min: 0.4, max: 0.6 },
            { label: '0.6-0.8', min: 0.6, max: 0.8 },
            { label: '0.8-1.0', min: 0.8, max: 1.0 }
        ];

        const riskProfile = buckets.map(bucket => {
            const inBucket = closedPositions.filter(
                p => p.entryPrice >= bucket.min && p.entryPrice < bucket.max
            );
            const wins = inBucket.filter(p => (p.pnl || 0) > 0).length;
            return {
                bucket: bucket.label,
                trades: inBucket.length,
                wins,
                winRate: inBucket.length > 0 ? Math.round((wins / inBucket.length) * 100) : 0
            };
        });

        // 2. SPEED PROFILE: Avg PnL by holding duration (not ROI %, which is crazy for probability-based pricing)
        const speedBuckets = [
            { label: '<1h', minMs: 0, maxMs: MS_PER_HOUR },
            { label: '1-24h', minMs: MS_PER_HOUR, maxMs: MS_PER_DAY },
            { label: '>24h', minMs: MS_PER_DAY, maxMs: Infinity }
        ];

        const speedProfile = speedBuckets.map(bucket => {
            const inBucket = closedPositions.filter(p => {
                if (!p.closedAt) return false;
                const holdMs = new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime();
                return holdMs >= bucket.minMs && holdMs < bucket.maxMs;
            });

            // Sum of PnL for this bucket
            const totalPnL = inBucket.reduce((sum, p) => sum + (p.pnl || 0), 0);

            return {
                duration: bucket.label,
                avgPnL: inBucket.length > 0 ? Number((totalPnL / inBucket.length).toFixed(2)) : 0,
                count: inBucket.length
            };
        });

        // 3. PNL HISTORY: Cumulative PnL by date
        const pnlByDate = new Map<string, number>();
        closedPositions
            .filter(p => p.closedAt)
            .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime())
            .forEach(p => {
                const date = new Date(p.closedAt!).toISOString().split('T')[0];
                const current = pnlByDate.get(date) || 0;
                pnlByDate.set(date, current + (p.pnl || 0));
            });

        let cumulative = 0;
        const pnlHistory = Array.from(pnlByDate.entries()).map(([date, dailyPnl]) => {
            cumulative += dailyPnl;
            return {
                date,
                dailyPnL: Number(dailyPnl.toFixed(2)),
                cumulativePnL: Number(cumulative.toFixed(2))
            };
        });

        return c.json({
            riskProfile,
            speedProfile,
            pnlHistory
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// ============================================================================
// PHASE 2: STRATEGY TUNING ENDPOINTS
// ============================================================================

// GET /:id/metrics - Detailed metrics for a specific strategy
strategies.get('/:id/metrics', async (c) => {
    try {
        const strategyId = c.req.param('id');
        
        const strategy = await prisma.strategy.findUnique({
            where: { id: strategyId }
        });
        
        if (!strategy) {
            return c.json({ error: 'Strategy not found' }, 404);
        }

        // Get all positions for this strategy
        const positions = await prisma.$queryRaw<Array<{
            status: string;
            amountUSD: number;
            pnl: number | null;
            exitValue: number | null;
            totalSlippage: number | null;
            gasCost: number | null;
            entryPrice: number;
            exitPrice: number | null;
            openedAt: Date;
            closedAt: Date | null;
        }>>`
            SELECT status, "amountUSD", pnl, "exitValue", "totalSlippage", "gasCost", 
                   "entryPrice", "exitPrice", "openedAt", "closedAt"
            FROM "PaperPosition"
            WHERE "strategyId" = ${strategyId}
        `;

        const closed = positions.filter(p => p.status.startsWith('CLOSED'));
        const open = positions.filter(p => p.status === 'OPEN');
        
        // Core metrics
        const totalInvested = closed.reduce((sum, p) => sum + (p.amountUSD || 0), 0);
        const totalPnL = closed.reduce((sum, p) => sum + (p.pnl || 0), 0);
        const wins = closed.filter(p => (p.pnl || 0) > 0).length;
        const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
        
        // Cost analysis
        const totalSlippage = closed.reduce((sum, p) => sum + (p.totalSlippage || 0), 0);
        const totalGas = closed.reduce((sum, p) => sum + (p.gasCost || 0), 0);
        const totalCosts = totalSlippage + totalGas;
        
        // Profit factor
        const grossWins = closed.filter(p => (p.pnl || 0) > 0).reduce((sum, p) => sum + (p.pnl || 0), 0);
        const grossLosses = Math.abs(closed.filter(p => (p.pnl || 0) < 0).reduce((sum, p) => sum + (p.pnl || 0), 0));
        const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;
        
        // Drawdown calculation
        let maxCumulative = 0;
        let maxDrawdown = 0;
        let cumulative = 0;
        
        closed
            .filter(p => p.closedAt)
            .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime())
            .forEach(p => {
                cumulative += p.pnl || 0;
                if (cumulative > maxCumulative) maxCumulative = cumulative;
                const drawdown = maxCumulative - cumulative;
                if (drawdown > maxDrawdown) maxDrawdown = drawdown;
            });

        // Average hold time
        const holdTimes = closed
            .filter(p => p.closedAt)
            .map(p => (new Date(p.closedAt!).getTime() - new Date(p.openedAt).getTime()) / (1000 * 3600));
        const avgHoldHours = holdTimes.length > 0 ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : 0;

        return c.json({
            strategy: {
                id: strategy.id,
                name: strategy.name,
                status: strategy.status,
                config: strategy.config,
                currentBalance: strategy.currentBalance,
                initialBudget: strategy.initialBudget
            },
            metrics: {
                totalTrades: closed.length,
                openPositions: open.length,
                winRate: Number(winRate.toFixed(1)),
                profitFactor: Number(profitFactor.toFixed(2)),
                totalPnL: Number(totalPnL.toFixed(2)),
                totalROI: totalInvested > 0 ? Number(((totalPnL / totalInvested) * 100).toFixed(2)) : 0,
                maxDrawdown: Number(maxDrawdown.toFixed(2)),
                avgHoldHours: Number(avgHoldHours.toFixed(1))
            },
            costs: {
                totalSlippage: Number(totalSlippage.toFixed(2)),
                totalGas: Number(totalGas.toFixed(2)),
                totalCosts: Number(totalCosts.toFixed(2)),
                costsPercent: totalPnL !== 0 ? Number(((totalCosts / Math.abs(totalPnL)) * 100).toFixed(1)) : 0
            }
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// PATCH /:id/config - Update strategy configuration (for A/B testing)
strategies.patch('/:id/config', async (c) => {
    try {
        const strategyId = c.req.param('id');
        const updates = await c.req.json();
        
        const strategy = await prisma.strategy.findUnique({
            where: { id: strategyId }
        });
        
        if (!strategy) {
            return c.json({ error: 'Strategy not found' }, 404);
        }

        // Merge new config with existing
        const currentConfig = strategy.config as Record<string, any> || {};
        const newConfig = { ...currentConfig, ...updates };
        
        // Validate config values
        if (newConfig.minScore !== undefined && (newConfig.minScore < 0 || newConfig.minScore > 100)) {
            return c.json({ error: 'minScore must be 0-100' }, 400);
        }
        if (newConfig.betSize !== undefined && newConfig.betSize < 10) {
            return c.json({ error: 'betSize must be >= $10' }, 400);
        }
        if (newConfig.takeProfit !== undefined && (newConfig.takeProfit < 0.05 || newConfig.takeProfit > 2)) {
            return c.json({ error: 'takeProfit must be 0.05-2.0 (5%-200%)' }, 400);
        }
        if (newConfig.stopLoss !== undefined && (newConfig.stopLoss < 0.05 || newConfig.stopLoss > 1)) {
            return c.json({ error: 'stopLoss must be 0.05-1.0 (5%-100%)' }, 400);
        }

        // Log config change for audit
        console.log(`📝 [Config] Strategy ${strategy.name} updated:`, {
            old: currentConfig,
            new: newConfig,
            changes: updates
        });

        const updated = await prisma.strategy.update({
            where: { id: strategyId },
            data: { config: newConfig }
        });

        return c.json({
            message: 'Config updated',
            strategy: updated
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// POST /:id/reset - Reset strategy balance and clear positions (for fresh A/B test)
strategies.post('/:id/reset', async (c) => {
    try {
        const strategyId = c.req.param('id');
        const body = await c.req.json().catch(() => ({}));
        const newBudget = body.budget || 1000;
        
        const strategy = await prisma.strategy.findUnique({
            where: { id: strategyId }
        });
        
        if (!strategy) {
            return c.json({ error: 'Strategy not found' }, 404);
        }

        // Close all open positions at current price (mark as abandoned)
        await prisma.paperPosition.updateMany({
            where: { strategyId, status: 'OPEN' },
            data: { 
                status: 'CLOSED_ABANDONED',
                closedAt: new Date(),
                exitReason: 'RESET'
            }
        });

        // Reset balance
        const updated = await prisma.strategy.update({
            where: { id: strategyId },
            data: { 
                currentBalance: newBudget,
                initialBudget: newBudget
            }
        });

        console.log(`🔄 [Reset] Strategy ${strategy.name} reset to $${newBudget}`);

        return c.json({
            message: 'Strategy reset',
            strategy: updated
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// GET /validation/summary - Quick validation summary for Phase 0
strategies.get('/validation/summary', async (c) => {
    try {
        // Get resolved signals with score buckets
        const signals = await prisma.$queryRaw<Array<{
            bucket: string;
            total: bigint;
            won: bigint;
        }>>`
            SELECT 
                CASE 
                    WHEN "aiScore" >= 80 THEN 'high'
                    WHEN "aiScore" >= 60 THEN 'medium'
                    ELSE 'low'
                END as bucket,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'WON' THEN 1 ELSE 0 END) as won
            FROM "Signal"
            WHERE status IN ('WON', 'LOST')
            GROUP BY bucket
        `;

        const bucketStats = signals.map(s => ({
            bucket: s.bucket,
            total: Number(s.total),
            won: Number(s.won),
            winRate: Number(s.total) > 0 ? Number(((Number(s.won) / Number(s.total)) * 100).toFixed(1)) : 0
        }));

        // Overall stats
        const totalResolved = bucketStats.reduce((sum, b) => sum + b.total, 0);
        const totalWon = bucketStats.reduce((sum, b) => sum + b.won, 0);
        
        // Check validation criteria
        const highBucket = bucketStats.find(b => b.bucket === 'high');
        const lowBucket = bucketStats.find(b => b.bucket === 'low');
        
        const spread = (highBucket?.winRate || 0) - (lowBucket?.winRate || 50);
        const isCorrelated = spread > 10;
        const hasEnoughData = totalResolved >= 20;
        const highScorePerforms = (highBucket?.winRate || 0) >= 60;

        return c.json({
            status: hasEnoughData && isCorrelated && highScorePerforms ? 'PASS' : 'PENDING',
            totalResolved,
            overallWinRate: totalResolved > 0 ? Number(((totalWon / totalResolved) * 100).toFixed(1)) : 0,
            buckets: bucketStats,
            validation: {
                hasEnoughData,
                isCorrelated,
                highScorePerforms,
                spread: Number(spread.toFixed(1))
            },
            recommendation: !hasEnoughData 
                ? 'Collect more data (need 20+ resolved signals)'
                : !isCorrelated 
                    ? 'Scoring needs tuning - no correlation detected'
                    : !highScorePerforms 
                        ? 'High-score signals underperforming - review criteria'
                        : 'Ready for Phase 2: Realistic Paper Trading'
        });
    } catch (e: unknown) {
        const error = e as Error;
        return c.json({ error: error.message }, 500);
    }
});

// GET /leaderboard - Strategy Performance Ranking
strategies.get('/leaderboard', async (c) => {
    try {
        // Fetch all strategies with their closed positions
        const strategiesData = await prisma.strategy.findMany({
            where: { status: 'ACTIVE' },
            include: {
                positions: {
                    where: { status: { startsWith: 'CLOSED' } },
                    select: { 
                        pnl: true, 
                        amountUSD: true,
                        openedAt: true,
                        closedAt: true
                    }
                },
                _count: {
                    select: { positions: true }
                }
            }
        });

        // Calculate metrics and rank
        const leaderboard = strategiesData.map(s => {
            const closed = s.positions;
            const totalTrades = closed.length;
            
            // [ACCURATE] PnL from balance change - this is the real profit
            // Note: position-level pnl may be 0 for legacy data, so we use balance delta
            const balancePnL = s.currentBalance - s.initialBudget;
            
            // Use balance-based PnL as source of truth
            const totalPnL = balancePnL;
            const roi = s.initialBudget > 0 ? (balancePnL / s.initialBudget) * 100 : 0;
            
            // Win rate from positions with actual PnL
            const positionsWithPnL = closed.filter(p => p.pnl !== null && p.pnl !== 0);
            const wins = positionsWithPnL.filter(p => (p.pnl || 0) > 0).length;
            const winRate = positionsWithPnL.length > 0 
                ? (wins / positionsWithPnL.length) * 100 
                : null; // null = not enough data

            // Open positions count
            const openPositions = s._count.positions - totalTrades;

            return {
                id: s.id,
                name: s.name,
                rank: 0, // Will be set after sorting
                metrics: {
                    totalPnL: Number(totalPnL.toFixed(2)),
                    roi: Number(roi.toFixed(2)),
                    winRate: winRate !== null ? Number(winRate.toFixed(1)) : null,
                    totalTrades,
                    openPositions
                },
                capital: {
                    initial: s.initialBudget,
                    current: Number(s.currentBalance.toFixed(2))
                },
                config: s.config
            };
        });

        // Sort by ROI (best performers first)
        leaderboard.sort((a, b) => b.metrics.roi - a.metrics.roi);
        
        // Assign ranks
        leaderboard.forEach((s, i) => s.rank = i + 1);

        // Summary stats
        const totalCapital = leaderboard.reduce((sum, s) => sum + s.capital.current, 0);
        const totalInitial = leaderboard.reduce((sum, s) => sum + s.capital.initial, 0);
        const aggregatePnL = totalCapital - totalInitial;
        const aggregateROI = totalInitial > 0 ? (aggregatePnL / totalInitial) * 100 : 0;

        return c.json({
            strategies: leaderboard,
            aggregate: {
                totalStrategies: leaderboard.length,
                totalCapital: Number(totalCapital.toFixed(2)),
                totalPnL: Number(aggregatePnL.toFixed(2)),
                aggregateROI: Number(aggregateROI.toFixed(2))
            },
            generatedAt: new Date().toISOString()
        });
    } catch (e: unknown) {
        const error = e as Error;
        return c.json({ error: error.message }, 500);
    }
});

export { strategies };
