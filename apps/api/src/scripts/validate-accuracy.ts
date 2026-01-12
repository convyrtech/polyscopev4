/**
 * WhaleScope Accuracy Validation Script
 * 
 * Analyzes correlation between AI Score and actual outcomes (WON/LOST)
 * Run: pnpm --filter api ts-node src/scripts/validate-accuracy.ts
 */

import { config } from 'dotenv';
config();

import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

interface BucketStats {
    label: string;
    min: number;
    max: number;
    total: number;
    won: number;
    lost: number;
    winRate: number;
    avgRoi: number;
}

async function validateAccuracy() {
    console.log('\n🔬 WhaleScope Accuracy Validation Report');
    console.log('='.repeat(70));
    console.log(`Generated: ${new Date().toISOString()}\n`);

    // 1. Overall Stats
    const total = await prisma.signal.count();
    const resolved = await prisma.signal.count({ 
        where: { status: { in: ['WON', 'LOST'] } } 
    });
    const open = await prisma.signal.count({ where: { status: 'OPEN' } });
    const won = await prisma.signal.count({ where: { status: 'WON' } });
    const lost = await prisma.signal.count({ where: { status: 'LOST' } });

    console.log('📊 Signal Overview:');
    console.log(`   Total Signals: ${total}`);
    console.log(`   Open: ${open}`);
    console.log(`   Resolved: ${resolved} (WON: ${won}, LOST: ${lost})`);
    
    if (resolved > 0) {
        console.log(`   Overall Win Rate: ${((won / resolved) * 100).toFixed(1)}%`);
    }

    if (resolved < 20) {
        console.log('\n⚠️  INSUFFICIENT DATA');
        console.log('   Need at least 20 resolved signals for valid analysis.');
        console.log('   Keep collecting data and run this script again.\n');
        
        // Show recent signals anyway
        await showRecentSignals();
        return false;
    }

    // 2. Accuracy by Score Bucket
    console.log('\n📈 Accuracy by AI Score Bucket:');
    console.log('-'.repeat(70));
    console.log('Score Range │ Total │  Won │ Lost │ Win Rate │  Avg ROI  │ Status');
    console.log('-'.repeat(70));

    const buckets = [
        { min: 90, max: 100, label: '90-100    ' },
        { min: 80, max: 89, label: '80-89     ' },
        { min: 70, max: 79, label: '70-79     ' },
        { min: 60, max: 69, label: '60-69     ' },
        { min: 50, max: 59, label: '50-59     ' },
        { min: 0, max: 49, label: '0-49      ' },
    ];

    const bucketResults: BucketStats[] = [];
    let validationPassed = true;

    for (const bucket of buckets) {
        const signals = await prisma.signal.findMany({
            where: {
                aiScore: { gte: bucket.min, lte: bucket.max },
                status: { in: ['WON', 'LOST'] }
            }
        });

        if (signals.length === 0) {
            console.log(`${bucket.label} │   0   │   -  │   -  │    -     │     -     │ ⚪ No data`);
            continue;
        }

        const wonCount = signals.filter(s => s.status === 'WON').length;
        const lostCount = signals.filter(s => s.status === 'LOST').length;
        const winRate = (wonCount / signals.length) * 100;
        const avgRoi = signals.reduce((sum, s) => sum + (s.roi || 0), 0) / signals.length;

        // Determine status
        let status = '⚪ Low data';
        if (signals.length >= 10) {
            if (bucket.min >= 80) {
                status = winRate >= 60 ? '✅ PASS' : '❌ FAIL';
                if (winRate < 60) validationPassed = false;
            } else if (bucket.min >= 60) {
                status = winRate >= 55 ? '✅ PASS' : '❌ FAIL';
                if (winRate < 55) validationPassed = false;
            } else {
                status = winRate < 55 ? '✅ Expected' : '⚠️ Unexpected';
            }
        }

        console.log(
            `${bucket.label} │ ${signals.length.toString().padStart(5)} │ ${wonCount.toString().padStart(4)} │ ${lostCount.toString().padStart(4)} │ ` +
            `${winRate.toFixed(1).padStart(6)}%  │ ${avgRoi.toFixed(1).padStart(7)}%  │ ${status}`
        );

        bucketResults.push({
            label: bucket.label,
            min: bucket.min,
            max: bucket.max,
            total: signals.length,
            won: wonCount,
            lost: lostCount,
            winRate,
            avgRoi
        });
    }

    console.log('-'.repeat(70));

    // 3. Correlation Check
    console.log('\n📉 Score-Outcome Correlation:');
    const highScoreWR = bucketResults.find(b => b.min >= 80)?.winRate || 0;
    const lowScoreWR = bucketResults.find(b => b.max <= 49)?.winRate || 50;
    const spread = highScoreWR - lowScoreWR;
    
    console.log(`   High Score (80+) Win Rate: ${highScoreWR.toFixed(1)}%`);
    console.log(`   Low Score (<50) Win Rate: ${lowScoreWR.toFixed(1)}%`);
    console.log(`   Spread: ${spread.toFixed(1)}pp`);
    
    if (spread > 10) {
        console.log('   ✅ Positive correlation detected - scoring adds value!');
    } else if (spread > 0) {
        console.log('   ⚠️ Weak correlation - scoring needs tuning');
    } else {
        console.log('   ❌ No correlation - scoring may be random');
        validationPassed = false;
    }

    // 4. Top Performing Whales (OPTIMIZED - single query with aggregation)
    console.log('\n🐳 Top 5 Whales by Win Rate (min 5 resolved signals):');
    console.log('-'.repeat(50));
    
    // Get all whale stats in one query using raw SQL for efficiency
    const whaleStatsRaw = await prisma.$queryRaw<Array<{
        whaleAddress: string;
        total: bigint;
        won: bigint;
        alias: string | null;
        tags: string | null;
    }>>`
        SELECT 
            s."whaleAddress",
            COUNT(*) as total,
            SUM(CASE WHEN s.status = 'WON' THEN 1 ELSE 0 END) as won,
            w.alias,
            w.tags
        FROM "Signal" s
        LEFT JOIN "Whale" w ON s."whaleAddress" = w.address
        WHERE s.status IN ('WON', 'LOST')
        GROUP BY s."whaleAddress", w.alias, w.tags
        HAVING COUNT(*) >= 5
        ORDER BY (SUM(CASE WHEN s.status = 'WON' THEN 1 ELSE 0 END)::float / COUNT(*)) DESC
        LIMIT 10
    `;

    const whaleStats = whaleStatsRaw.map(w => ({
        address: w.whaleAddress,
        alias: w.alias || 'Unknown',
        tags: w.tags || '',
        total: Number(w.total),
        won: Number(w.won),
        winRate: (Number(w.won) / Number(w.total)) * 100
    }));

    whaleStats
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, 5)
        .forEach((w, i) => {
            console.log(`   ${i + 1}. ${w.address.slice(0, 12)}... │ ${w.total} signals │ ${w.winRate.toFixed(0)}% WR │ ${w.tags || '-'}`);
        });

    // 5. Strategy Performance
    console.log('\n🎯 Strategy Performance:');
    console.log('-'.repeat(50));
    
    const strategies = ['SNIPER', 'INSIDER', null];
    for (const strat of strategies) {
        const stratSignals = await prisma.signal.findMany({
            where: { 
                strategyName: strat,
                status: { in: ['WON', 'LOST'] } 
            }
        });
        
        if (stratSignals.length === 0) continue;
        
        const stratWon = stratSignals.filter(s => s.status === 'WON').length;
        const stratWR = (stratWon / stratSignals.length) * 100;
        const stratAvgRoi = stratSignals.reduce((sum, s) => sum + (s.roi || 0), 0) / stratSignals.length;
        
        console.log(`   ${(strat || 'NONE').padEnd(10)} │ ${stratSignals.length.toString().padStart(4)} signals │ ${stratWR.toFixed(1)}% WR │ ${stratAvgRoi.toFixed(1)}% avg ROI`);
    }

    // 6. Final Verdict
    console.log('\n' + '='.repeat(70));
    console.log('🎯 VALIDATION RESULT:');
    
    if (validationPassed) {
        console.log('   ✅ PASSED - Scoring correlation detected!');
        console.log('   → Ready for Phase 1: Realistic Paper Trading');
        console.log('\n   Next steps:');
        console.log('   1. Implement dynamic slippage (liquidity.service.ts)');
        console.log('   2. Add exit slippage + gas costs');
        console.log('   3. Run performance-report.ts for detailed metrics');
    } else {
        console.log('   ❌ FAILED - Scoring needs tuning');
        console.log('   → Go to Phase 0.5: Systematic Tuning');
        console.log('\n   Try these experiments (one at a time):');
        console.log('   A. Increase MIN_TRADE to $2000');
        console.log('   B. Disable Insider Score (funding analysis)');
        console.log('   C. Only PROVEN whales (WR >= 60%)');
        console.log('   D. Crypto-only markets');
    }
    
    console.log('='.repeat(70) + '\n');
    
    return validationPassed;
}

async function showRecentSignals() {
    console.log('\n📋 Recent Signals (last 10):');
    console.log('-'.repeat(70));
    
    const recent = await prisma.signal.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        select: {
            timestamp: true,
            marketSlug: true,
            outcome: true,
            aiScore: true,
            status: true,
            amountUSD: true,
            strategyName: true
        }
    });
    
    for (const sig of recent) {
        const statusIcon = sig.status === 'WON' ? '✅' : sig.status === 'LOST' ? '❌' : '⏳';
        console.log(
            `   ${statusIcon} Score ${sig.aiScore.toString().padStart(2)} │ ` +
            `$${sig.amountUSD.toFixed(0).padStart(6)} │ ` +
            `${(sig.strategyName || '-').padEnd(8)} │ ` +
            `${sig.marketSlug.slice(0, 30)}...`
        );
    }
}

// Run
validateAccuracy()
    .then(passed => {
        process.exit(passed ? 0 : 1);
    })
    .catch(e => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
