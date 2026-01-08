import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding Strategies...');

    const strategies = [
        {
            name: "Insider Aggressive",
            config: {
                minScore: 80,
                slippage: 0.01,
                takeProfit: 0.50,
                stopLoss: 0.20,
                freshWallet: true
            }
        },
        {
            name: "Smart Money Sniper",
            config: {
                minScore: 60,
                slippage: 0.01,
                takeProfit: 0.30,
                trailingStop: 0.10,
                minVol: 5000
            }
        },
        {
            name: "Value Contrarian",
            config: {
                minScore: 70,
                maxPrice: 0.35,
                takeProfit: 1.00,
                stopLoss: 0.15
            }
        }
    ];

    for (const strat of strategies) {
        // Idempotency: Remove existing with same name to ensure fresh config
        await prisma.strategy.deleteMany({
            where: { name: strat.name }
        });

        const created = await prisma.strategy.create({
            data: {
                name: strat.name,
                status: 'ACTIVE',
                config: strat.config
            }
        });

        console.log(`✅ Created: ${created.name} (ID: ${created.id})`);
        console.log(`   Config:`, JSON.stringify(created.config));
    }

    console.log('\n✨ Seeding Complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
