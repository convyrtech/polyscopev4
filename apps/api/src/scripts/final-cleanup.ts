import { config } from 'dotenv';
config();

import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 FINAL CLEANUP: Resetting to 3 Elite Strategies...\n');

    // =========================================================================
    // 1. PURGE EVERYTHING
    // =========================================================================
    console.log('🗑️  Purging Paper Positions...');
    const deletedPositions = await prisma.paperPosition.deleteMany({});
    console.log(`   Deleted ${deletedPositions.count} positions.`);

    console.log('🗑️  Purging ALL Strategies...');
    const deletedStrategies = await prisma.strategy.deleteMany({});
    console.log(`   Deleted ${deletedStrategies.count} strategies.`);

    // =========================================================================
    // 2. SEED 3 ELITE STRATEGIES
    // =========================================================================
    console.log('\n🌱 Seeding 3 Elite Strategies...\n');

    const eliteStrategies = [
        {
            id: 'the-grinder',
            name: 'The Grinder ($20 Challenge)',
            initialBudget: 20.00,
            currentBalance: 20.00,
            config: {
                betSize: 1.0,           // $1 micro bets
                minScore: 20,           // Low threshold for volume
                minVol: 100,            // $100 minimum trade size
                takeProfit: 0.05,       // +5% quick scalp
                stopLoss: 0.05,         // -5% tight stop
                slippage: 0.01,         // 1% pessimistic
                description: '$20 Challenge: Micro-scalping with tight risk management'
            }
        },
        {
            id: 'insider-aggressive',
            name: 'Insider Aggressive ($10k)',
            initialBudget: 10000.00,
            currentBalance: 10000.00,
            config: {
                betSize: 500,           // $500 per trade
                minScore: 80,           // High confidence only
                freshWallet: true,      // Prioritize new wallets
                takeProfit: 0.50,       // +50% target
                stopLoss: 0.20,         // -20% max loss
                slippage: 0.01,
                description: 'Follows high-conviction insider signals with aggressive sizing'
            }
        },
        {
            id: 'smart-sniper',
            name: 'Smart Sniper ($10k)',
            initialBudget: 10000.00,
            currentBalance: 10000.00,
            config: {
                betSize: 1000,          // $1000 per trade
                minScore: 90,           // Elite signals only
                minVol: 5000,           // Large whale trades only
                takeProfit: 0.30,       // +30% target
                stopLoss: 0.15,         // -15% stop (implied)
                slippage: 0.01,
                description: 'Snipes high-volume whale moves with precision'
            }
        }
    ];

    for (const strat of eliteStrategies) {
        await prisma.strategy.create({
            data: {
                id: strat.id,
                name: strat.name,
                status: 'ACTIVE',
                initialBudget: strat.initialBudget,
                currentBalance: strat.currentBalance,
                config: strat.config
            }
        });
        console.log(`   ✅ ${strat.name}`);
        console.log(`      Budget: $${strat.initialBudget.toFixed(2)} | BetSize: $${strat.config.betSize} | MinScore: ${strat.config.minScore}`);
    }

    // =========================================================================
    // 3. VERIFY
    // =========================================================================
    console.log('\n📋 Final Strategy State:');
    const final = await prisma.strategy.findMany({ orderBy: { initialBudget: 'asc' } });
    console.log(`   Total Strategies: ${final.length}`);
    
    for (const s of final) {
        const cfg = s.config as any;
        console.log(`   • ${s.name} | $${s.currentBalance.toFixed(2)} | minScore=${cfg.minScore}`);
    }

    console.log('\n✨ FINAL CLEANUP COMPLETE. Dashboard should show exactly 3 cards.');
}

main()
    .catch(e => {
        console.error('❌ Cleanup Failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
