import { Hono } from 'hono';
import { PrismaClient } from '@whalescope/db';

const strategies = new Hono();
const prisma = new PrismaClient();

// GET /stats - Dashboard Agreggates
strategies.get('/stats', async (c) => {
    try {
        // Active Positions Count
        const activePositions = await prisma.paperPosition.count({
            where: { status: 'OPEN' }
        });

        // Global Closed PnL
        const closedStats = await prisma.paperPosition.aggregate({
            where: { status: 'CLOSED' },
            _sum: { pnl: true },
            _count: true
        });

        const totalPnL = closedStats._sum.pnl || 0;
        const totalClosed = closedStats._count;

        // Calculate Global Winrate
        const wins = await prisma.paperPosition.count({
            where: { status: 'CLOSED', pnl: { gt: 0 } }
        });

        const winrate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;

        return c.json({
            activePositions,
            netPnL: Number(totalPnL.toFixed(2)), // Ensure 2 decimals
            winRate: Math.round(winrate),
            totalTrades: totalClosed
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// GET / - List Strategies
strategies.get('/', async (c) => {
    try {
        const list = await prisma.strategy.findMany({
            orderBy: { name: 'asc' },
            include: {
                positions: {
                    where: { status: 'CLOSED' },
                    select: { pnl: true }
                }
            }
        });

        // Map to include calculated local stats per strategy if needed
        const result = list.map(s => {
            const pnl = s.positions.reduce((acc, p) => acc + (p.pnl || 0), 0);
            return {
                ...s,
                totalPnL: Number(pnl.toFixed(2))
            };
        });

        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// GET /positions - List Positions (Active + History)
strategies.get('/positions', async (c) => {
    try {
        const positions = await prisma.paperPosition.findMany({
            take: 100,
            orderBy: [
                { status: 'desc' },      // OPEN first
                { openedAt: 'desc' }    // Then newest
            ],
            include: { strategy: { select: { name: true } } }
        });
        return c.json(positions);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// GET /analytics - Hedge Fund Style Analytics
strategies.get('/analytics', async (c) => {
    try {
        // Fetch all closed positions for analysis
        const closedPositions = await prisma.paperPosition.findMany({
            where: { status: 'CLOSED' },
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
            { label: '<1h', minMs: 0, maxMs: 60 * 60 * 1000 },
            { label: '1-24h', minMs: 60 * 60 * 1000, maxMs: 24 * 60 * 60 * 1000 },
            { label: '>24h', minMs: 24 * 60 * 60 * 1000, maxMs: Infinity }
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
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export { strategies };
