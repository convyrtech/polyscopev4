
import { config } from 'dotenv';
config(); // Load env from .env

import { PrismaClient } from '@whalescope/db';
const prisma = new PrismaClient();

async function main() {
    console.log('🔧 Seeding DEBUG Strategy: Vacuum Cleaner...');

    const debugStrategy = {
        name: 'DEBUG: Vacuum Cleaner',
        config: {
            minScore: 10,      // Low threshold
            minVolume: 0,      // No minimum volume
            takeProfit: 0.05,  // +5%
            stopLoss: 0.05,    // -5%
            slippage: 0.01,    // 1%
            description: "Loose Cannon: Buys everything for debugging"
        }
    };

    // Upsert the strategy
    await prisma.strategy.upsert({
        where: { id: 'debug-vacuum-cleaner' },
        update: {
            config: debugStrategy.config,
            status: 'ACTIVE'
        },
        create: {
            id: 'debug-vacuum-cleaner',
            name: debugStrategy.name,
            status: 'ACTIVE',
            config: debugStrategy.config
        }
    });

    console.log(`✅ DEBUG Strategy Active: ${debugStrategy.name}`);
    console.log('⚠️  Restart the API to pick up changes!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
