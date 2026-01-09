
import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log('📊 Analyzing Signal Scores (Last 24h)...');

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Fetch all signals in last 24h
    const signals = await prisma.signal.findMany({
        where: {
            timestamp: {
                gte: twentyFourHoursAgo
            }
        },
        include: {
            whale: true // Include whale details to see if winrate data is there
        }
    });

    if (signals.length === 0) {
        console.log('⚠️ No signals found in the last 24 hours.');
        return;
    }

    // Stats
    let min = 100;
    let max = 0;
    let total = 0;
    let above55 = 0;

    for (const s of signals) {
        if (s.aiScore < min) min = s.aiScore;
        if (s.aiScore > max) max = s.aiScore;
        total += s.aiScore;
        if (s.aiScore > 55) above55++;
    }

    const avg = total / signals.length;

    console.log(`\n📈 Stats (${signals.length} signals):`);
    console.log(`   Min Score: ${min}`);
    console.log(`   Max Score: ${max}`);
    console.log(`   Avg Score: ${avg.toFixed(2)}`);
    console.log(`   > 55 Score: ${above55} (${((above55 / signals.length) * 100).toFixed(1)}%)`);

    // Deep Dive into a "Mediocre" Signal
    // Find one that should have maybe been higher
    const mediocre = signals.find(s => s.aiScore >= 50 && s.aiScore <= 52);

    if (mediocre) {
        console.log('\n🧐 Deep Dive (Score ' + mediocre.aiScore + '):');
        console.log(`   Market: ${mediocre.marketSlug}`);
        console.log(`   Outcome: ${mediocre.outcome}`);
        console.log(`   Whale: ${mediocre.whaleAddress}`);
        console.log(`   Whale WinRate: ${mediocre.whale?.winrate}%`); // THIS IS CRITICAL
        console.log(`   Whale PnL: $${mediocre.whale?.pnl}`);
        console.log(`   Signal Vol: $${mediocre.amountUSD}`);
        console.log(`   Timestamp: ${mediocre.timestamp.toISOString()}`);
        console.log(`   Tags: ${mediocre.tags}`);
    } else {
        console.log('\nℹ️ No signals found in 50-52 range for deep dive.');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
