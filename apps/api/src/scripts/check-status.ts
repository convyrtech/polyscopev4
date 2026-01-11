import { config } from 'dotenv';
config();

import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

async function main() {
    console.log('📊 Signal Status Distribution:');
    const statusCounts = await prisma.signal.groupBy({
        by: ['status'],
        _count: true
    });
    statusCounts.forEach(s => console.log(`   ${s.status}: ${s._count}`));

    console.log('\n🐳 Whales with Tags:');
    const whales = await prisma.whale.findMany({
        where: { tags: { not: '' } },
        take: 10,
        orderBy: { pnl: 'desc' }
    });
    
    if (whales.length === 0) {
        console.log('   (none yet - profiler will add tags after market resolution)');
    } else {
        whales.forEach(w => {
            console.log(`   ${w.address.slice(0, 15)}... | Tags: ${w.tags} | PnL: $${w.pnl.toFixed(2)}`);
        });
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
