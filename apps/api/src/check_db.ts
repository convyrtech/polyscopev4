import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Checking Database State...");

    // 1. Counts
    const whaleCount = await prisma.whale.count();
    const signalCount = await prisma.signal.count();

    console.log(`📊 Stats: ${whaleCount} Whales | ${signalCount} Signals`);

    // 2. Recent Signals
    console.log("\n📉 Recent Signals (Trades):");
    const signals = await prisma.signal.findMany({
        take: 5,
        orderBy: { timestamp: 'desc' }
    });

    if (signals.length === 0) console.log("   (No signals found)");
    signals.forEach(s => {
        console.log(`   [${s.timestamp.toISOString()}] ${s.side} $${s.amountUSD.toFixed(2)} on "${s.marketSlug.slice(0, 30)}..."`);
    });

    // 3. Top Whales
    console.log("\n🐳 Top Whales (by Volume):");
    const whales = await prisma.whale.findMany({
        take: 5,
        orderBy: { volume: 'desc' }
    });

    if (whales.length === 0) console.log("   (No whales found)");
    whales.forEach(w => {
        console.log(`   ${w.address}: Vol $${w.volume.toFixed(0)} | PnL $${w.pnl.toFixed(0)} | Tags: [${w.tags}]`);
    });
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
