
import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding "Project 5X" Strategy...');

    // Clear existing Project 5X if any
    await prisma.strategy.deleteMany({
        where: { name: 'PROJECT 5X (Momentum)' }
    });

    const strategy = await prisma.strategy.create({
        data: {
            name: 'PROJECT 5X (Momentum)',
            status: 'ACTIVE',
            initialBudget: 20.00,
            currentBalance: 20.00,
            config: {
                // Strict filters
                minScore: 95,      // Only Syndicates (Score 100) or Super Whales
                minVol: 1000,      // Ignore dust

                // Aggressive sizing
                betSize: 10.0,

                // Scalping Exits
                takeProfit: 0.15,  // +15%
                stopLoss: 0.05,    // -5% strict stop

                // No Sports
                filterCategories: ["Crypto", "Politics", "Business"]
            }
        }
    });

    console.log('✅ Strategy Created:', strategy);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
