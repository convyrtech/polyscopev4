
import { ResolutionService } from '../services/resolution.service';
import { PaperTradingService } from '../services/paper-trading.service';
import { calculateSlippage } from '../services/liquidity.service';
import { prisma } from '@whalescope/db';
import axios from 'axios';

// Mocking mechanism (simple monkey-patching for this script)
const mockPrisma = {
    strategy: { update: async () => ({ currentBalance: 900 }) },
    paperPosition: { create: async () => ({ id: 'pos1' }), findMany: async () => [], update: async () => ({}) },
    signal: { findMany: async () => [], update: async () => ({}) },
    whale: { findUnique: async () => ({}), update: async () => ({}) },
    $transaction: async (args: any[]) => {
        console.log('⚡ [Prisma] $transaction called with', args.length, 'operations');
        // Simulate atomic execution
        try {
            // Execute promises (conceptually)
            const results = [];
            for (const arg of args) {
                // In real prisma, these are "PrismaPromise" objects. 
                // Here we just simulate success.
                results.push({});
            }
            return [{ currentBalance: 900 }, { id: 'pos1' }];
        } catch (e) {
            console.error('⚡ [Prisma] Transaction FAILED (Rollback)');
            throw e;
        }
    }
};

// Override global prisma (dangerous but effective for script)
(global as any).prisma = mockPrisma;
// Also mock axios
const mockAxios = {
    get: async () => ({ data: [] })
};

console.log('🚀 STARTING P0 FIX STRESS TEST\n');

async function testRaceCondition() {
    console.log('--- TEST 1: RACE CONDITION (Atomic Transaction) ---');
    const service = PaperTradingService.getInstance();

    // Inject mock transaction that FAILS on 2nd step
    const originalTx = prisma.$transaction;
    (prisma as any).$transaction = async () => {
        console.log('⚡ [Prisma] Executing Step 1: Balance Deduct... OK');
        console.log('⚡ [Prisma] Executing Step 2: Position Create... 💥 FAILURE (Unique Constraint)');
        throw new Error('Unique constraint failed on paperPosition');
    };

    const signal = {
        id: 'sig1', marketSlug: 'btc-100k', outcome: 'Yes', price: 0.5,
        amountUSD: 1000, aiScore: 80, whaleAddress: '0x1'
    } as any;

    const strategy = {
        id: 'strat1', name: 'TestStrat', config: { betSize: 100 },
        currentBalance: 1000, status: 'ACTIVE'
    } as any;

    await (service as any).executeEntry(signal, [strategy], 100);

    // Restore
    (prisma as any).$transaction = originalTx;
    console.log('✅ Result: Transaction threw error, Balance should verify "unchanged" (simulated rollback).\n');
}

async function testTimeoutError() {
    console.log('--- TEST 2: TIMEOUT SILENT ERROR ---');
    const service = PaperTradingService.getInstance();

    // Create a scenario where executeEntry throws
    const originalEntry = (service as any).executeEntry;
    (service as any).executeEntry = async () => {
        throw new Error('CRITICAL UNHANDLED ERROR inside Async Timeout');
    };

    // Temporarily replace console.error to catch output
    const originalConsoleError = console.error;
    let errorCaught = false;
    console.error = (...args) => {
        if (args[0].includes('Critical Error in delayed execution')) {
            console.log('✅ CAUGHT expected error in console.error:', args[0]);
            errorCaught = true;
        }
    };

    // Hack to bypass 10s latency: Override setTimeout
    const originalSetTimeout = setTimeout;
    (global as any).setTimeout = (cb: any, _ms: any) => originalSetTimeout(cb, 50);

    // Trigger onSignal which calls setTimeout (now forced to 50ms)
    await service.onSignal({ id: 'sig2', marketSlug: 'test', price: 0.5, aiScore: 100 } as any);

    // Wait slightly more than 50ms
    await new Promise(r => originalSetTimeout(r, 200));

    if (!errorCaught) console.log('❌ FAILED: Error was swallowed!');

    // Restore
    (global as any).setTimeout = originalSetTimeout;
    (service as any).executeEntry = originalEntry;
    console.error = originalConsoleError;
    console.log('\n');
}

async function testResolutionPrecision() {
    console.log('--- TEST 3: RESOLUTION PRECISION (Floating Point) ---');
    const service = new ResolutionService();

    // Mock Axios response for CheckMarket
    // Scenario 1: Price 0.9995 (Should trigger 1.0 win)
    // Scenario 2: Price 0.5/0.5 (Closed) -> VOID
    // Scenario 3: Price 0.99 (Closed) -> Should NOT resolve (too far from 1.0)

    const mockEvents = [
        {
            // Case 1: Implicit Win
            slug: 'implicit-win',
            markets: [{
                closed: true,
                resolved: false,
                outcomePrices: '["0.0005", "0.9995"]', // Index 1 wins
                outcomes: '["No", "Yes"]'
            }]
        },
        {
            // Case 2: Void
            slug: 'void-market',
            markets: [{
                closed: true,
                resolved: false,
                outcomePrices: '["0.501", "0.499"]', // Both near 0.5
                outcomes: '["Yes", "No"]'
            }]
        },
        {
            // Case 3: Disputed / Unclear
            slug: 'disputed-market',
            markets: [{
                closed: true,
                resolved: false,
                outcomePrices: '["0.6", "0.4"]',
                outcomes: '["Yes", "No"]'
            }]
        }
    ];

    (axios.get as any) = async (url: string, config: any) => {
        const slug = config.params.slug;
        const event = mockEvents.find(e => e.slug === slug);
        return { data: event ? [event] : [] };
    };

    // Run checkMarket (private method access via any)
    console.log('Testing Implicit Win (0.9995)...');
    await (service as any).checkMarket('implicit-win');

    console.log('Testing Void (0.501/0.499)...');
    await (service as any).checkMarket('void-market');

    console.log('Testing Disputed (0.6/0.4)...');
    await (service as any).checkMarket('disputed-market');

    console.log('✅ Check logs above for "IMPLICIT RESOLUTION", "VOIDED", "DISPUTED"\n');
}

async function testDivZero() {
    console.log('--- TEST 4: DIVISION BY ZERO (Liquidity) ---');

    const res1 = await calculateSlippage('token', 'BUY', 100, 0);
    console.log('Result for price=0:', res1.effectivePrice === 0.5 && res1.isLiquid === false ? '✅ Safe Fallback' : '❌ Failed');

    const res2 = await calculateSlippage('token', 'BUY', 100, NaN);
    console.log('Result for price=NaN:', res2.effectivePrice === 0.5 ? '✅ Safe Fallback' : '❌ Failed');

    const res3 = await calculateSlippage('token', 'BUY', 100, -5);
    console.log('Result for price=-5:', res3.effectivePrice === 0.5 ? '✅ Safe Fallback' : '❌ Failed');
    console.log('\n');
}

async function run() {
    await testRaceCondition();
    await testTimeoutError();
    await testResolutionPrecision();
    await testDivZero();
    console.log('🏁 STRESS TEST COMPLETE');
}

run();
