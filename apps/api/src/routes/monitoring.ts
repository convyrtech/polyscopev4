import { Hono } from 'hono';
import { prisma } from '@whalescope/db';
import { MS_PER_HOUR, MS_PER_DAY } from '../lib/constants';

const monitoring = new Hono();

// GET /live - Real-time system status
monitoring.get('/live', async (c) => {
    try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - MS_PER_HOUR);
        const oneDayAgo = new Date(now.getTime() - MS_PER_DAY);

        // Signals in last hour
        const recentSignals = await prisma.signal.count({
            where: { timestamp: { gte: oneHourAgo } }
        });

        // Signals in last 24h
        const dailySignals = await prisma.signal.count({
            where: { timestamp: { gte: oneDayAgo } }
        });

        // Open positions
        const openPositions = await prisma.paperPosition.count({
            where: { status: 'OPEN' }
        });

        // Today's P&L
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayPositions = await prisma.paperPosition.findMany({
            where: { 
                closedAt: { gte: todayStart },
                status: { startsWith: 'CLOSED' }
            },
            select: { pnl: true }
        });
        const todayPnL = todayPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);

        // Active whales (traded in last hour)
        const activeWhales = await prisma.whale.count({
            where: { lastActive: { gte: oneHourAgo } }
        });

        // High-score signals today
        const highScoreSignals = await prisma.signal.count({
            where: { 
                timestamp: { gte: todayStart },
                aiScore: { gte: 80 }
            }
        });

        return c.json({
            timestamp: now.toISOString(),
            signals: {
                lastHour: recentSignals,
                last24h: dailySignals,
                highScoreToday: highScoreSignals
            },
            positions: {
                open: openPositions,
                todayPnL: Number(todayPnL.toFixed(2))
            },
            whales: {
                activeLastHour: activeWhales
            },
            health: {
                signalRate: recentSignals > 0 ? 'HEALTHY' : 'LOW_ACTIVITY',
                systemStatus: 'RUNNING'
            }
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// GET /signals/recent - Latest signals for live feed
monitoring.get('/signals/recent', async (c) => {
    try {
        const limit = parseInt(c.req.query('limit') || '20');
        const minScore = parseInt(c.req.query('minScore') || '0');

        const signals = await prisma.signal.findMany({
            where: minScore > 0 ? { aiScore: { gte: minScore } } : undefined,
            take: Math.min(limit, 100),
            orderBy: { timestamp: 'desc' },
            select: {
                id: true,
                timestamp: true,
                marketSlug: true,
                outcome: true,
                side: true,
                price: true,
                amountUSD: true,
                aiScore: true,
                status: true,
                strategyName: true,
                whaleAddress: true,  // Added for whale popover
                whale: {
                    select: {
                        alias: true,
                        tags: true,
                        winrate: true,
                        pnl: true  // Added for tooltip
                    }
                }
            }
        });

        return c.json(signals.map(s => ({
            ...s,
            timestamp: s.timestamp.toISOString(),
            whaleAlias: s.whale?.alias || 'Unknown',
            whaleTags: s.whale?.tags || '',
            whaleWinrate: s.whale?.winrate || null,
            whalePnl: s.whale?.pnl || null
        })));
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// GET /whales/leaderboard - Top performing whales
monitoring.get('/whales/leaderboard', async (c) => {
    try {
        const timeframe = c.req.query('timeframe') || '7d';
        
        let dateFilter: Date;
        switch (timeframe) {
            case '24h':
                dateFilter = new Date(Date.now() - MS_PER_DAY);
                break;
            case '7d':
                dateFilter = new Date(Date.now() - 7 * MS_PER_DAY);
                break;
            case '30d':
                dateFilter = new Date(Date.now() - 30 * MS_PER_DAY);
                break;
            default:
                dateFilter = new Date(0); // All time
        }

        const leaderboard = await prisma.$queryRaw<Array<{
            address: string;
            alias: string | null;
            tags: string | null;
            totalTrades: bigint;
            wonTrades: bigint;
            totalVolume: number;
        }>>`
            SELECT 
                w.address,
                w.alias,
                w.tags,
                COUNT(s.id) as "totalTrades",
                SUM(CASE WHEN s.status = 'WON' THEN 1 ELSE 0 END) as "wonTrades",
                SUM(s."amountUSD") as "totalVolume"
            FROM "Whale" w
            JOIN "Signal" s ON s."whaleAddress" = w.address
            WHERE s.timestamp >= ${dateFilter}
            AND s.status IN ('WON', 'LOST')
            GROUP BY w.address, w.alias, w.tags
            HAVING COUNT(s.id) >= 3
            ORDER BY (SUM(CASE WHEN s.status = 'WON' THEN 1 ELSE 0 END)::float / COUNT(s.id)) DESC
            LIMIT 20
        `;

        return c.json(leaderboard.map(w => ({
            address: w.address,
            alias: w.alias || `${w.address.slice(0, 8)}...`,
            tags: w.tags || '',
            totalTrades: Number(w.totalTrades),
            winRate: Number(w.totalTrades) > 0 
                ? Number(((Number(w.wonTrades) / Number(w.totalTrades)) * 100).toFixed(1))
                : 0,
            totalVolume: Number(w.totalVolume.toFixed(0))
        })));
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// GET /markets/hot - Markets with most whale activity
monitoring.get('/markets/hot', async (c) => {
    try {
        const since = new Date(Date.now() - MS_PER_DAY);

        const hotMarkets = await prisma.$queryRaw<Array<{
            marketSlug: string;
            signalCount: bigint;
            totalVolume: number;
            avgScore: number;
            uniqueWhales: bigint;
        }>>`
            SELECT 
                "marketSlug",
                COUNT(*) as "signalCount",
                SUM("amountUSD") as "totalVolume",
                AVG("aiScore") as "avgScore",
                COUNT(DISTINCT "whaleAddress") as "uniqueWhales"
            FROM "Signal"
            WHERE timestamp >= ${since}
            GROUP BY "marketSlug"
            HAVING COUNT(*) >= 2
            ORDER BY SUM("amountUSD") DESC
            LIMIT 15
        `;

        return c.json(hotMarkets.map(m => ({
            market: m.marketSlug,
            signals: Number(m.signalCount),
            volume: Number(m.totalVolume.toFixed(0)),
            avgScore: Number(m.avgScore.toFixed(0)),
            whales: Number(m.uniqueWhales)
        })));
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// GET /performance/daily - Daily P&L breakdown
monitoring.get('/performance/daily', async (c) => {
    try {
        const days = parseInt(c.req.query('days') || '14');
        const since = new Date(Date.now() - days * MS_PER_DAY);

        const dailyPnL = await prisma.$queryRaw<Array<{
            date: Date;
            trades: bigint;
            wins: bigint;
            totalPnL: number;
        }>>`
            SELECT 
                DATE("closedAt") as date,
                COUNT(*) as trades,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
                SUM(pnl) as "totalPnL"
            FROM "PaperPosition"
            WHERE "closedAt" >= ${since}
            AND status LIKE 'CLOSED%'
            GROUP BY DATE("closedAt")
            ORDER BY date DESC
        `;

        let cumulative = 0;
        const result = dailyPnL.reverse().map(d => {
            cumulative += d.totalPnL || 0;
            return {
                date: d.date.toISOString().split('T')[0],
                trades: Number(d.trades),
                wins: Number(d.wins),
                winRate: Number(d.trades) > 0 ? Number(((Number(d.wins) / Number(d.trades)) * 100).toFixed(0)) : 0,
                pnl: Number((d.totalPnL || 0).toFixed(2)),
                cumulative: Number(cumulative.toFixed(2))
            };
        });

        return c.json(result.reverse()); // Most recent first
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

export { monitoring };
