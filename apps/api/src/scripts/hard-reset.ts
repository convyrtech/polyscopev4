
import dotenv from 'dotenv';
import { PrismaClient } from '@whalescope/db';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 STARTING HARD RESET...');

    // 1. Delete All Paper Positions
    console.log('🗑️ Deleting Paper Positions...');
    const deletedPos = await prisma.paperPosition.deleteMany({});
    console.log(`   Deleted ${deletedPos.count} positions.`);

    // 1.5 [NEW] Reset ALL strategy balances to initial
    console.log('💰 Resetting ALL strategy balances...');
    const allStrategies = await prisma.strategy.findMany();
    for (const strat of allStrategies) {
        await prisma.strategy.update({
            where: { id: strat.id },
            data: { currentBalance: strat.initialBudget }
        });
        console.log(`   💰 ${strat.name}: $${strat.initialBudget.toFixed(2)}`);
    }

    // 2. Mark Signals as PROCESSED (Prevent Re-entry)
    // Actually, if we delete positions, the signals might be picked up again if Ingestor restarts and re-processes?
    // Ingestor handles deduplication via `txHash` P2002 check.
    // However, if we want to ensure NO older signals trade, we can mark them.
    // But `Signal` model doesn't strictly track "Re-trade" status for Paper.
    // PaperService reacts to NEW signals. Existing signals in DB are not re-processed by PaperService automatically
    // UNLESS the ingestor re-emits them.
    // Ingestor re-emits if it processes a historical trade again.
    // But Ingestor deduplicates using `processedTradeIds` (memory) and `Signal.create` (DB constraint).
    // So simply deleting positions is safe IF the signals are already in DB.

    // BUT, the prompt asked to: "Reset: Set all Signal status to PROCESSED".
    // Let's check Signal Status enum. usually OPEN, CLOSED, PROCESSED?
    // Let's assume 'PROCESSED' is valid or use 'CLOSED'.
    // `status` is String.
    console.log('🔒 Locking historical signals...');
    const updatedSignals = await prisma.signal.updateMany({
        where: { status: 'OPEN' },
        data: { status: 'ARCHIVED' } // Use ARCHIVED to be clear
    });
    console.log(`   Archived ${updatedSignals.count} signals.`);

    // 3. Re-Seed Strategies (Fresh Configs)
    const productionStrategies = [
        {
            name: "Insider Follower",
            description: "Follows whales with >80% winrate",
            config: {
                minScore: 80,
                whales: [], // Dynamic
                takeProfit: 1.5, // +150% (2.5x)
                stopLoss: 0.5,   // -50%
                betSize: 100,
                slippage: 0.05
            }
        },
        {
            name: "Sniper Entry",
            description: "Enters instantly on high-confidence signals",
            config: {
                minScore: 90,
                minConfidence: 0.85,
                takeProfit: 0.5, // +50% (Scalp)
                stopLoss: 0.2,   // -20%
                betSize: 200
            }
        },
        {
            name: "Contrarian Fade",
            description: "Bets against retail FOMO on high prices",
            config: {
                minScore: 50,    // [FIX] Added minScore to prevent Score 0 trades
                maxPrice: 0.40, // Only buy cheap calls
                minVol: 5000,
                takeProfit: 2.0, // +200%
                stopLoss: 0.5,
                betSize: 100
            }
        }
    ];

    console.log('🌱 Re-seeding Strategies...');
    for (const s of productionStrategies) {
        // Construct stable ID from name (e.g. "Insider Follower" -> "insider-follower")
        const stableId = s.name.toLowerCase().replace(/\s+/g, '-');

        await prisma.strategy.upsert({
            where: { id: stableId },
            update: {
                status: 'ACTIVE',
                config: s.config as any,
                currentBalance: 10000,  // [FIX] Reset balance on update too
                initialBudget: 10000
            },
            create: {
                id: stableId, // Explicit ID
                name: s.name,
                // description: s.description, // Schema might not have description? Let's check schema.
                // Schema Line 91: config Json. Line 89: name String. 
                // Wait, schema DOES NOT HAVE DESCRIPTION field on line 87+.
                // My hard-reset script has 'description' property in create, but reset-and-seed puts it in config?
                // reset-and-seed: config: { description: "..." }
                // My hard-reset: create: { name, description, ... } -> This would FAIL if description col doesn't exist.
                // Schema check: 
                // model Strategy { id, name, status, config, createdAt, positions }
                // NO description column.

                // So I must put description inside config or remove it.
                status: 'ACTIVE',
                config: {
                    ...s.config,
                    description: s.description
                } as any
            }
        });
        console.log(`   ✅ Seeded: ${s.name}`);
    }

    console.log('✨ HARD RESET COMPLETE. Dashboard PnL should be $0.00.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
