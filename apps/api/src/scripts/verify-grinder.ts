import { config } from 'dotenv';
config();

import { PrismaClient } from '@whalescope/db';
const prisma = new PrismaClient();

async function main() {
    console.log('\n🎯 ACTIVE STRATEGIES:\n');
    
    const strategies = await prisma.strategy.findMany({ 
        where: { status: 'ACTIVE' },
        orderBy: { currentBalance: 'asc' }
    });
    
    for (const s of strategies) {
        const cfg = s.config as any;
        console.log(`  • ${s.name}`);
        console.log(`    Budget: $${s.currentBalance.toFixed(2)} / $${s.initialBudget.toFixed(2)}`);
        console.log(`    BetSize: $${cfg.betSize || '100 (default)'}`);
        console.log(`    MinScore: ${cfg.minScore || 'none'}`);
        console.log(`    Config: ${JSON.stringify(s.config)}\n`);
    }
    
    // Check The Grinder specifically
    const grinder = strategies.find(s => s.name.includes('Grinder'));
    if (grinder) {
        console.log('✅ "The Grinder" is ACTIVE!\n');
    } else {
        console.log('❌ "The Grinder" NOT FOUND!\n');
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
