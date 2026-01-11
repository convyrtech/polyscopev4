import { config } from 'dotenv';
config();

import { PrismaClient } from '@whalescope/db';
import { ProfilerService } from '../services/profiler.service';

const prisma = new PrismaClient();
const profiler = ProfilerService.getInstance();

async function main() {
    console.log('🔬 Testing ProfilerService...\n');

    // 1. Find whales with resolved trades
    const whalesWithHistory = await prisma.whale.findMany({
        where: {
            signals: {
                some: {
                    status: { in: ['WON', 'LOST'] }
                }
            }
        },
        take: 5,
        orderBy: { volume: 'desc' }
    });

    if (whalesWithHistory.length === 0) {
        console.log('❌ No whales with resolved trades found. Run resolution first.');
        return;
    }

    console.log(`Found ${whalesWithHistory.length} whales with trading history.\n`);

    // 2. Profile each whale
    for (const whale of whalesWithHistory) {
        console.log(`\n📊 Profiling: ${whale.address.slice(0, 15)}...`);
        console.log(`   Current Tags: "${whale.tags || 'none'}"`);

        const profile = await profiler.updateProfile(whale.address);

        if (profile) {
            console.log(`   Total Trades: ${profile.totalTrades} (W: ${profile.wins} / L: ${profile.losses})`);
            console.log(`   Win Rate: ${profile.winrate.toFixed(1)}%`);
            console.log(`   Total PnL: $${profile.totalPnL.toFixed(2)}`);
            console.log(`   New Tags: [${profile.newTags.join(', ') || 'none'}]`);
        }
    }

    // 3. Show updated whales
    console.log('\n\n📋 Updated Whale Tags:');
    const updatedWhales = await prisma.whale.findMany({
        where: { tags: { not: '' } },
        orderBy: { pnl: 'desc' },
        take: 10
    });

    for (const w of updatedWhales) {
        console.log(`   ${w.address.slice(0, 15)}... | Tags: ${w.tags} | PnL: $${w.pnl.toFixed(2)} | WR: ${w.winrate.toFixed(1)}%`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
