
import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 DIAGNOSTIC REPORT");
    console.log("====================");

    // 1. Total Signals
    const total = await prisma.signal.count();
    console.log(`📊 Total Signals in DB: ${total}`);

    // 2. Signals by Outcome (Check for UNK)
    const byOutcome = await prisma.signal.groupBy({
        by: ['outcome', 'marketSlug'],
        _count: true
    });
    console.log("\n📈 By Outcome & Slug:");
    byOutcome.forEach(g => console.log(`   - ${g.marketSlug} [${g.outcome}]: ${g._count}`));

    where: {
        timestamp: {
            gt: new Date(Date.now() - 60 * 60 * 1000)
        }
    }
    console.log(`\n⏱️ Signals created in last 1h: ${recent}`);

    // 4. Sample Signal (if any)
    const sample = await prisma.signal.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    if (sample) {
        console.log("\n📝 Latet Signal:");
        console.log(JSON.stringify(sample, null, 2));
    } else {
        console.log("\n❌ No signals found.");
    }

    console.log("====================");
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
