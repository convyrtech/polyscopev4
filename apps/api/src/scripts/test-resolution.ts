// UNIT TEST: Resolution Logic
import { prisma } from '@whalescope/db';

interface MockMarket {
    resolved: boolean | null;
    outcomes: string; // JSON string
}

function parseOutcomesForResolution(market: MockMarket): { resolved: boolean; winner: string | null } {
    // Same logic as resolution.service.ts
    
    // 1. Check resolved flag
    if (market.resolved === true) {
        return { resolved: true, winner: null }; // Need to parse outcomes for winner
    }

    // 2. Check implicit resolution via prices
    try {
        const outcomes = JSON.parse(market.outcomes || '[]');
        if (!Array.isArray(outcomes) || outcomes.length < 2) {
            return { resolved: false, winner: null };
        }

        const price0 = parseFloat(outcomes[0]) || 0;
        const price1 = parseFloat(outcomes[1]) || 0;

        // Price-based resolution
        if (price0 === 1) return { resolved: true, winner: 'first' };
        if (price1 === 1) return { resolved: true, winner: 'second' };
        if (price0 === 0) return { resolved: true, winner: 'second' };
        if (price1 === 0) return { resolved: true, winner: 'first' };

        return { resolved: false, winner: null };
    } catch {
        return { resolved: false, winner: null };
    }
}

async function runTests() {
    console.log('=== UNIT TEST: RESOLUTION LOGIC ===\n');

    const testCases: { name: string; market: MockMarket; expectedResolved: boolean; expectedWinner: string | null }[] = [
        {
            name: 'Active market (prices 0.40, 0.60)',
            market: { resolved: null, outcomes: '["0.40", "0.60"]' },
            expectedResolved: false,
            expectedWinner: null
        },
        {
            name: 'First outcome wins (price0=1)',
            market: { resolved: null, outcomes: '["1", "0"]' },
            expectedResolved: true,
            expectedWinner: 'first'
        },
        {
            name: 'Second outcome wins (price1=1)',
            market: { resolved: null, outcomes: '["0", "1"]' },
            expectedResolved: true,
            expectedWinner: 'second'
        },
        {
            name: 'First outcome loses (price0=0)',
            market: { resolved: null, outcomes: '["0", "0.99"]' },
            expectedResolved: true,
            expectedWinner: 'second'
        },
        {
            name: 'Explicitly resolved',
            market: { resolved: true, outcomes: '["1", "0"]' },
            expectedResolved: true,
            expectedWinner: null // Would need more parsing
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const tc of testCases) {
        const result = parseOutcomesForResolution(tc.market);
        const resolvedOK = result.resolved === tc.expectedResolved;
        const winnerOK = result.winner === tc.expectedWinner;
        
        if (resolvedOK && winnerOK) {
            console.log(`✅ ${tc.name}`);
            passed++;
        } else {
            console.log(`❌ ${tc.name}`);
            console.log(`   Expected: resolved=${tc.expectedResolved}, winner=${tc.expectedWinner}`);
            console.log(`   Got:      resolved=${result.resolved}, winner=${result.winner}`);
            failed++;
        }
    }

    console.log(`\n=== RESULTS: ${passed}/${passed + failed} PASSED ===`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
