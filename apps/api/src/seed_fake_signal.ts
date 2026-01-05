
import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding Fake Signal for Extension Test...");

    const SLUG = 'russia-x-ukraine-ceasefire-by-january-31-2026';
    const WHALE_ADDR = '0xSHADOW0000000000000000000000000LEV1ATHAN'; // Existing Leviathan

    // 1. Ensure Whale Exists
    await prisma.whale.upsert({
        where: { address: WHALE_ADDR },
        update: {
            alias: 'Anonymous Leviathan',
            tags: "LEVIATHAN,TEST",
            volume: 1000000
        },
        create: {
            address: WHALE_ADDR,
            alias: 'Anonymous Leviathan',
            tags: "LEVIATHAN,TEST",
            volume: 1000000
        }
    });

    // 2. Create Signal (Big Sell)
    await prisma.signal.create({
        data: {
            txHash: `sim-${Date.now()}`,
            timestamp: new Date(),
            marketSlug: SLUG,
            conditionId: '0xTEST',
            outcome: 'No',
            side: 'SELL',
            price: 0.09,
            amountUSD: 50000,
            whaleAddress: WHALE_ADDR,
            status: 'OPEN',
            aiScore: 92,
            tags: 'CONTRARIAN_DIVERGENCE'
        }
    });

    console.log(`✅ Seeded $50k SELL on ${SLUG}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
