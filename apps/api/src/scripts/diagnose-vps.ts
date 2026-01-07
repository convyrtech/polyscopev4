/**
 * VPS Diagnostic Script for WhaleScope
 * 
 * Verifies that the Ingestor is generating data in the production Postgres DB.
 * 
 * Usage: 
 *   cd apps/api
 *   set DATABASE_URL=postgresql://whale:password@87.120.186.161:5432/whalescope
 *   npx tsx src/scripts/diagnose-vps.ts
 */

import { PrismaClient, Signal, Whale } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log('========================================');
    console.log('  WhaleScope VPS Diagnostic Report');
    console.log('  Timestamp:', new Date().toISOString());
    console.log('========================================\n');

    try {
        // 1. PULSE: Signal counts (1h vs 24h)
        console.log('📊 [PULSE] Signal Ingestion Stats\n');

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [last1hCount, last24hCount, totalCount] = await Promise.all([
            prisma.signal.count({ where: { timestamp: { gte: oneHourAgo } } }),
            prisma.signal.count({ where: { timestamp: { gte: twentyFourHoursAgo } } }),
            prisma.signal.count(),
        ]);

        console.table([
            { Metric: 'Signals (Last 1 Hour)', Count: last1hCount },
            { Metric: 'Signals (Last 24 Hours)', Count: last24hCount },
            { Metric: 'Total Signals (All Time)', Count: totalCount },
        ]);

        // Alert if no recent data
        if (last1hCount === 0) {
            console.log('⚠️  WARNING: No signals ingested in the last hour! Ingestor may be down.\n');
        } else {
            console.log('✅ Ingestor is active.\n');
        }

        // 2. DATA QUALITY: Last 5 Signals
        console.log('📋 [DATA QUALITY] Last 5 Signals\n');

        const last5Signals = await prisma.signal.findMany({
            orderBy: { timestamp: 'desc' },
            take: 5,
            select: {
                marketSlug: true,
                outcome: true,
                aiScore: true,
                status: true,
                timestamp: true,
            },
        });

        if (last5Signals.length === 0) {
            console.log('⚠️  No signals found in database.\n');
        } else {
            console.table(
                last5Signals.map((s: Pick<Signal, 'marketSlug' | 'outcome' | 'aiScore' | 'status' | 'timestamp'>) => ({
                    Market: s.marketSlug.slice(0, 40) + (s.marketSlug.length > 40 ? '...' : ''),
                    Outcome: s.outcome,
                    Score: s.aiScore.toFixed(2),
                    Status: s.status,
                    Timestamp: s.timestamp.toISOString(),
                }))
            );
        }

        // 3. WHALES: Top 5 by Score
        console.log('\n🐋 [WHALES] Top 5 Whales by Score\n');

        const top5Whales = await prisma.whale.findMany({
            orderBy: { score: 'desc' },
            take: 5,
            select: {
                address: true,
                alias: true,
                score: true,
                pnl: true,
                winrate: true,
                volume: true,
            },
        });

        if (top5Whales.length === 0) {
            console.log('⚠️  No whales found in database.\n');
        } else {
            console.table(
                top5Whales.map((w: Pick<Whale, 'address' | 'alias' | 'score' | 'pnl' | 'winrate' | 'volume'>) => ({
                    Address: w.address.slice(0, 10) + '...' + w.address.slice(-6),
                    Alias: w.alias || '—',
                    Score: w.score.toFixed(2),
                    PnL: `$${w.pnl.toLocaleString()}`,
                    Winrate: `${(w.winrate * 100).toFixed(1)}%`,
                    Volume: `$${w.volume.toLocaleString()}`,
                }))
            );
        }

        // 4. LATENCY: Time since newest signal
        console.log('\n⏱️  [LATENCY] Data Freshness\n');

        const newestSignal = await prisma.signal.findFirst({
            orderBy: { timestamp: 'desc' },
            select: { timestamp: true },
        });

        if (newestSignal) {
            const latencyMs = Date.now() - newestSignal.timestamp.getTime();
            const latencySeconds = Math.floor(latencyMs / 1000);
            const latencyMinutes = Math.floor(latencySeconds / 60);
            const latencyHours = Math.floor(latencyMinutes / 60);

            let latencyDisplay: string;
            if (latencyHours > 0) {
                latencyDisplay = `${latencyHours}h ${latencyMinutes % 60}m ago`;
            } else if (latencyMinutes > 0) {
                latencyDisplay = `${latencyMinutes}m ${latencySeconds % 60}s ago`;
            } else {
                latencyDisplay = `${latencySeconds}s ago`;
            }

            console.table([
                { Metric: 'Newest Signal Timestamp', Value: newestSignal.timestamp.toISOString() },
                { Metric: 'Current Time', Value: new Date().toISOString() },
                { Metric: 'Latency', Value: latencyDisplay },
                { Metric: 'Latency (ms)', Value: latencyMs.toLocaleString() },
            ]);

            // Alert based on latency
            if (latencyMinutes >= 60) {
                console.log('🔴 CRITICAL: Data is over 1 hour stale! Check ingestor status.\n');
            } else if (latencyMinutes >= 15) {
                console.log('🟠 WARNING: Data is over 15 minutes stale.\n');
            } else {
                console.log('🟢 Data freshness is healthy.\n');
            }
        } else {
            console.log('⚠️  No signals found to calculate latency.\n');
        }

        console.log('========================================');
        console.log('  Diagnostic Complete');
        console.log('========================================');

    } catch (error) {
        console.error('❌ DATABASE CONNECTION ERROR\n');

        if (error instanceof Error) {
            console.error('Error Name:', error.name);
            console.error('Error Message:', error.message);

            if (error.message.includes('ECONNREFUSED')) {
                console.error('\n💡 Hint: Database connection refused. Check if PostgreSQL is running and DATABASE_URL is correct.');
            } else if (error.message.includes('authentication failed')) {
                console.error('\n💡 Hint: Authentication failed. Check your database credentials in DATABASE_URL.');
            } else if (error.message.includes('does not exist')) {
                console.error('\n💡 Hint: Database or table does not exist. Run prisma db push or migrations.');
            }
        } else {
            console.error('Unknown error:', error);
        }

        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
