
import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log("🧹 Starting Deep Maintenance...");

    // 1. Delete Corrupted Signals (UNK Outcome)
    const corrupted = await prisma.signal.deleteMany({
        where: { outcome: 'UNK' }
    });
    console.log(`✅ Deleted ${corrupted.count} corrupted signals (Outcome = 'UNK').`);

    console.log("✨ database is clean. Restarting process will trigger fresh backfill.");
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
