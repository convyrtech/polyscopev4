
import { config } from 'dotenv';
config(); // Load env from .env

import { PrismaClient } from '@whalescope/db';
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 cleaning up Test Data...');

    // 0. Delete Dependent Positions first (FK Constraint)
    console.log('🧹 cleaning up Dependent Positions...');
    await prisma.paperPosition.deleteMany({
        where: {
            strategy: {
                name: { contains: 'Test' }
            }
        }
    });

    // 1. Delete "Test" Strategies
    const deleted = await prisma.strategy.deleteMany({
        where: {
            name: { contains: 'Test' }
        }
    });
    console.log(`✅ Deleted ${deleted.count} Test Strategies.`);

    // 2. Seed Production Strategies
    console.log('🌱 Seeding Production Strategies...');

    const strategies = [
        {
            name: 'Insider Follower',
            config: {
                takeProfit: 0.50, // +50%
                stopLoss: 0.15,   // -15%
                whales: [],       // Will populate later
                description: "Follows whales with >80% winrate"
            }
        },
        {
            name: 'Sniper Entry',
            config: {
                takeProfit: 0.30,
                stopLoss: 0.10,
                description: "Quick scalps on high volume reversals"
            }
        },
        {
            name: 'Contrarian Fade',
            config: {
                takeProfit: 1.0,  // +100%
                stopLoss: 0.20,
                description: "Fades retail FOMO spikes"
            }
        }
    ];

    for (const s of strategies) {
        await prisma.strategy.upsert({
            where: { id: s.name.toLowerCase().replace(/\s+/g, '-') }, // stable ID
            update: { config: s.config },
            create: {
                id: s.name.toLowerCase().replace(/\s+/g, '-'),
                name: s.name,
                status: 'ACTIVE',
                config: s.config
            }
        });
        console.log(`   + Upserted: ${s.name}`);
    }

    console.log('✨ Reset & Seed Complete.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
