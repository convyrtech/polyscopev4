/**
 * Backfill Funding Analysis Script
 * 
 * Analyzes top whales' funding sources to populate:
 * - fundingSource
 * - fundingSourceTag (RETAIL, SUSPICIOUS_INSIDER, BRIDGE, etc.)
 * - fundingAnalyzedAt
 * 
 * Usage: npx tsx scripts/backfill-funding.ts [--limit=50] [--delay=200]
 * Run from: apps/api directory
 */

import { PrismaClient } from '@prisma/client';
import { fundingService } from '../src/services/funding.service';

const prisma = new PrismaClient();

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name: string, defaultVal: number) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? parseInt(arg.split('=')[1]) : defaultVal;
};

const LIMIT = getArg('limit', 50);
const DELAY_MS = getArg('delay', 200); // Rate limit protection

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfillFunding() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║         WhaleScope - Funding Source Backfill                 ║
╚══════════════════════════════════════════════════════════════╝
    `);

    console.log(`📊 Config: Limit=${LIMIT}, Delay=${DELAY_MS}ms\n`);

    // Fetch top whales by volume (most active)
    const whales = await prisma.whale.findMany({
        take: LIMIT,
        orderBy: { volume: 'desc' },
        select: {
            address: true,
            volume: true,
            pnl: true,
            fundingSourceTag: true,
            fundingAnalyzedAt: true,
        }
    });

    console.log(`🐋 Found ${whales.length} whales to analyze\n`);

    let analyzed = 0;
    let skipped = 0;
    let errors = 0;
    const stats = {
        RETAIL: 0,
        SUSPICIOUS_INSIDER: 0,
        BRIDGE: 0,
        WHALE: 0,
        PROTOCOL: 0,
        UNKNOWN: 0,
    };

    for (let i = 0; i < whales.length; i++) {
        const whale = whales[i];
        const progress = `[${i + 1}/${whales.length}]`;

        // Skip if already analyzed recently (within 24h)
        if (whale.fundingAnalyzedAt) {
            const age = Date.now() - whale.fundingAnalyzedAt.getTime();
            const hoursAgo = Math.floor(age / (1000 * 60 * 60));
            if (hoursAgo < 24) {
                console.log(`${progress} ⏭️  ${whale.address.substring(0, 12)}... - Already analyzed ${hoursAgo}h ago (${whale.fundingSourceTag})`);
                skipped++;
                stats[whale.fundingSourceTag as keyof typeof stats]++;
                continue;
            }
        }

        try {
            // Clear cache to force fresh analysis
            fundingService.clearCache(whale.address);

            const result = await fundingService.analyzeFunding(whale.address);
            
            // Update stats
            stats[result.tag as keyof typeof stats]++;
            analyzed++;

            // Visual indicator based on result
            const icon = result.tag === 'SUSPICIOUS_INSIDER' ? '🌪️' :
                         result.tag === 'RETAIL' ? '🏦' :
                         result.tag === 'BRIDGE' ? '🌉' :
                         result.tag === 'WHALE' ? '💎' :
                         result.tag === 'PROTOCOL' ? '⚙️' : '❓';

            console.log(`${progress} ${icon} ${whale.address.substring(0, 12)}... → ${result.tag} (${result.sourceName})`);

            // Rate limit protection
            await sleep(DELAY_MS);

        } catch (error: any) {
            console.log(`${progress} ❌ ${whale.address.substring(0, 12)}... - Error: ${error.message}`);
            errors++;
        }
    }

    // Summary
    console.log(`
════════════════════════════════════════════════════════════════
📊 BACKFILL COMPLETE
════════════════════════════════════════════════════════════════
  Analyzed:  ${analyzed}
  Skipped:   ${skipped}
  Errors:    ${errors}
  
  RESULTS:
    🏦 RETAIL (CEX):           ${stats.RETAIL}
    🌪️ SUSPICIOUS_INSIDER:     ${stats.SUSPICIOUS_INSIDER}
    🌉 BRIDGE:                 ${stats.BRIDGE}
    💎 WHALE:                  ${stats.WHALE}
    ⚙️ PROTOCOL:               ${stats.PROTOCOL}
    ❓ UNKNOWN:                ${stats.UNKNOWN}
════════════════════════════════════════════════════════════════
    `);

    // Highlight insiders
    if (stats.SUSPICIOUS_INSIDER > 0) {
        console.log(`\n⚠️  ALERT: Found ${stats.SUSPICIOUS_INSIDER} potential insider(s) funded via mixers!\n`);
        
        const insiders = await prisma.whale.findMany({
            where: { fundingSourceTag: 'SUSPICIOUS_INSIDER' },
            select: { address: true, volume: true, pnl: true },
            take: 10
        });
        
        for (const insider of insiders) {
            console.log(`   🌪️ ${insider.address} | Volume: $${insider.volume?.toFixed(2) || 0} | PnL: $${insider.pnl?.toFixed(2) || 0}`);
        }
    }

    await prisma.$disconnect();
    process.exit(0);
}

// Run
backfillFunding().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
