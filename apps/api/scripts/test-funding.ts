/**
 * Test Script: Source of Funds Detection
 * 
 * Tests the FundingService with real addresses to verify:
 * 1. Alchemy API connectivity
 * 2. Known address detection
 * 3. Score boost calculation
 * 
 * Usage: npx tsx scripts/test-funding.ts [address]
 */

import { fundingService } from '../src/services/funding.service';
import { lookupAddress } from '../src/data/known-addresses';

// Test addresses (mix of known and unknown)
const TEST_ADDRESSES = [
    // Known Tornado Cash (should return SUSPICIOUS_INSIDER)
    '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936',
    
    // Known Binance (should return RETAIL)
    '0x28c6c06298d514db089934071355e5743bf21d60',
    
    // Random Polymarket whale (unknown funding)
    '0x1234567890abcdef1234567890abcdef12345678',
];

async function testKnownAddressLookup() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST 1: Known Address Lookup (Local)');
    console.log('='.repeat(60));

    const testCases = [
        { addr: '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936', expected: 'SUSPICIOUS_INSIDER' },
        { addr: '0x28c6c06298d514db089934071355e5743bf21d60', expected: 'RETAIL' },
        { addr: '0xa0c68c638235ee32657e8f720a23cec1bfc77c77', expected: 'BRIDGE' },
        { addr: '0x0000000000000000000000000000000000000000', expected: null },
    ];

    for (const { addr, expected } of testCases) {
        const result = lookupAddress(addr);
        const status = (result?.tag || null) === expected ? '✅' : '❌';
        console.log(`${status} ${addr.substring(0, 12)}... → ${result?.tag || 'null'} (expected: ${expected || 'null'})`);
    }
}

async function testFundingAnalysis(address: string) {
    console.log('\n' + '='.repeat(60));
    console.log(`🔍 Analyzing: ${address}`);
    console.log('='.repeat(60));

    const startTime = Date.now();
    
    try {
        const result = await fundingService.analyzeFunding(address);
        const elapsed = Date.now() - startTime;

        console.log(`
📊 Analysis Result:
─────────────────────────────────────
  Tag:           ${result.tag}
  Source:        ${result.sourceName}
  Score Boost:   ${result.scoreBoost > 0 ? '+' : ''}${result.scoreBoost}
  Confidence:    ${result.confidence}
  Details:       ${result.analysisDetails}
  Time:          ${elapsed}ms
─────────────────────────────────────
        `);

        // Interpretation
        if (result.tag === 'SUSPICIOUS_INSIDER') {
            console.log('🌪️  VERDICT: Likely insider - funded via mixer/privacy protocol');
        } else if (result.tag === 'RETAIL') {
            console.log('🏦  VERDICT: Likely retail - funded via centralized exchange');
        } else if (result.tag === 'BRIDGE') {
            console.log('🌉  VERDICT: Cross-chain user - shows DeFi sophistication');
        } else if (result.tag === 'WHALE') {
            console.log('🐋  VERDICT: Known whale - historical smart money');
        } else {
            console.log('❓  VERDICT: Unknown source - proceed with caution');
        }

        return result;
    } catch (error: any) {
        console.error(`❌ Analysis failed: ${error.message}`);
        return null;
    }
}

async function testScoreIntegration() {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 TEST 3: Score Boost Integration');
    console.log('='.repeat(60));

    const addresses = [
        '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936', // Tornado
        '0x28c6c06298d514db089934071355e5743bf21d60', // Binance
    ];

    for (const addr of addresses) {
        const boost = await fundingService.getScoreBoost(addr);
        const isSuspicious = await fundingService.hasSuspiciousFunding(addr);
        const isRetail = await fundingService.isRetailFunded(addr);

        console.log(`${addr.substring(0, 12)}...`);
        console.log(`  Score Boost:    ${boost > 0 ? '+' : ''}${boost}`);
        console.log(`  Is Suspicious:  ${isSuspicious ? '🌪️ YES' : 'No'}`);
        console.log(`  Is Retail:      ${isRetail ? '🏦 YES' : 'No'}`);
        console.log('');
    }
}

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║         WhaleScope - Source of Funds Test Suite              ║
╚══════════════════════════════════════════════════════════════╝
    `);

    // Get address from CLI args or use default
    const customAddress = process.argv[2];

    // Test 1: Local lookup
    await testKnownAddressLookup();

    // Test 2: Alchemy analysis
    if (customAddress) {
        await testFundingAnalysis(customAddress);
    } else {
        console.log('\n📡 Testing Alchemy API with sample addresses...');
        for (const addr of TEST_ADDRESSES.slice(0, 2)) {
            await testFundingAnalysis(addr);
        }
    }

    // Test 3: Score integration
    await testScoreIntegration();

    console.log('\n✅ All tests complete!\n');
    process.exit(0);
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
