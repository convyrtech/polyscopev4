import { PrismaClient } from '@whalescope/db';
import { PaperTradingService } from '../services/paper-trading.service';

const prisma = new PrismaClient();
const service = PaperTradingService.getInstance();

async function main() {
    console.log('🧪 Starting Paper Trading Logic Verification...');

    const TEST_MARKET = 'test-market-logic-v1';
    const TEST_WHALE = '0x9999999999999999999999999999999999999999';
    const TEST_STRATEGY = 'Test Logic Strat';

    // 🧹 Cleanup
    await prisma.paperPosition.deleteMany({ where: { marketSlug: TEST_MARKET } });
    await prisma.strategy.deleteMany({ where: { name: TEST_STRATEGY } });

    // 🛠️ Setup Strategy
    const strategy = await prisma.strategy.create({
        data: {
            name: TEST_STRATEGY,
            status: 'ACTIVE',
            config: {
                slippage: 0.01,    // 1%
                takeProfit: 0.50,  // +50%
                stopLoss: 0.10,    // -10%
                whales: [TEST_WHALE] // Watch this whale
            }
        }
    });
    console.log('✅ Setup: Test Strategy Created.');

    // =========================================================================
    // 🧪 TEST 1: Slippage Math (via onSignal)
    // =========================================================================
    console.log('\n🕐 Test 1: Slippage & Entry (Waiting 6s for latency simulation)...');

    const fakeSignal = {
        id: 'test-sig-1',
        marketSlug: TEST_MARKET,
        outcome: 'Yes',
        price: 0.50,
        amountUSD: 1000,
        whaleAddress: TEST_WHALE,
        side: 'BUY',
        timestamp: new Date(),
        aiScore: 75  // Required for paper trading
    };

    // Trigger Entry
    await service.onSignal(fakeSignal);

    // Wait for the built-in 5s latency
    await new Promise(r => setTimeout(r, 6000));

    const pos1 = await prisma.paperPosition.findFirst({
        where: { marketSlug: TEST_MARKET, status: 'OPEN' }
    });

    if (!pos1) throw new Error('❌ Test 1 Failed: Position not created after timeout.');

    // Expected: 0.50 * 1.01 = 0.505
    const expectedEntry = 0.50 * 1.01;
    if (Math.abs(pos1.entryPrice - expectedEntry) < 0.0001) {
        console.log(`✅ Test 1 Passed: Entry Price ${pos1.entryPrice} matches expected ${expectedEntry} (1% Slippage)`);
    } else {
        throw new Error(`❌ Test 1 Failed: Entry Price ${pos1.entryPrice} != ${expectedEntry}`);
    }

    // =========================================================================
    // 🧪 TEST 2: Multi-Outcome Safety
    // =========================================================================
    console.log('\n🛡️ Test 2: Multi-Outcome Safety (No Cross-Outcome Closes)...');

    // Trying to "Kill" the 'Yes' position with a 'No' trade that hits Stop Loss price
    // Position Entry: 0.505. Stop Loss: 0.45 (approx).
    // Trade: Outcome 'No', Price 0.10 (Crash!). Should be IGNORED.

    await service.onMarketTrade({
        marketSlug: TEST_MARKET,
        outcome: 'No', // Different outcome!
        price: 0.10,
        amountUSD: 5000,
        side: 'SELL',
        actorAddress: '0xRandom'
    });

    const pos2 = await prisma.paperPosition.findUnique({ where: { id: pos1.id } });
    if (pos2?.status === 'OPEN') {
        console.log('✅ Test 2 Passed: "No" trade did not close "Yes" position.');
    } else {
        throw new Error(`❌ Test 2 Failed: Position closed by wrong outcome trade! Reason: ${pos2?.exitReason}`);
    }

    // =========================================================================
    // 🧪 TEST 3: Whale Panic Exit (Copy-Sell)
    // =========================================================================
    console.log('\n🚨 Test 3: Whale Panic Exit...');

    // Now the tracked whale sells 'Yes'. Should trigger PANIC exit.
    await service.onMarketTrade({
        marketSlug: TEST_MARKET,
        outcome: 'Yes', // Matching outcome
        price: 0.48, // Slightly down, but not SL yet. (SL is -10% -> 0.45)
        amountUSD: 50000,
        side: 'SELL',
        actorAddress: TEST_WHALE // The watched whale!
    });

    const pos3 = await prisma.paperPosition.findUnique({ where: { id: pos1.id } });
    if (pos3?.status === 'CLOSED' && pos3.exitReason === 'PANIC_WHALE_DUMP') {
        console.log('✅ Test 3 Passed: Position closed immediately on Whale Dump.');
    } else {
        throw new Error(`❌ Test 3 Failed: Position status is ${pos3?.status}, Reason: ${pos3?.exitReason}`);
    }

    console.log('\n✨ ALL LOGIC TESTS PASSED.');
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
