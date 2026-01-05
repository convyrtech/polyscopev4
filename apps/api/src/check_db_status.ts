
import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    const whales = await prisma.whale.count();
    const signals = await prisma.signal.count();
    console.log(`🐳 Whales in DB: ${whales}`);
    console.log(`📡 Signals in DB: ${signals}`);

    const recentSignals = await prisma.signal.findMany({
        take: 5,
        orderBy: { timestamp: 'desc' },
        include: { whale: true }
    });
    console.log("Recent Signals:", JSON.stringify(recentSignals, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
