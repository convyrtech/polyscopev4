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
                { createdAt: 'desc' }    // Then newest
            ],
            include: { strategy: { select: { name: true } } }
        });
        return c.json(positions);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export { strategies };
