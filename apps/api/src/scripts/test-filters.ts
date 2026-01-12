// UNIT TEST: Verify HIGH PRICE filter works
import { AnalysisService, TradeData, WhaleData } from '../services/analysis.service';

const analysisService = new AnalysisService();

const mockWhale: WhaleData = {
    pnl: 5000,
    winrate: 0.65,
    totalTrades: 50
};

async function runTests() {
    console.log('=== UNIT TEST: PRICE FILTERS ===\n');

    // Test 1: Normal price should get score
    const normalTrade: TradeData = {
        amountUSD: 1000,
        isNewMarket: false,
        price: 0.50,
        side: 'BUY',
        marketSlug: 'test-market',
        outcome: 'Yes'
    };
    const score1 = await analysisService.calculateScore(mockWhale, normalTrade, '0xTest1');
    console.log(`TEST 1: price=0.50 → score=${score1} (should be > 0)`);
    console.log(score1 > 0 ? '✅ PASS' : '❌ FAIL');

    // Test 2: FOMO price (0.95) should get score = 0
    const fomoTrade: TradeData = {
        amountUSD: 1000,
        isNewMarket: false,
        price: 0.95,
        side: 'BUY',
        marketSlug: 'test-market-fomo',
        outcome: 'Yes'
    };
    const score2 = await analysisService.calculateScore(mockWhale, fomoTrade, '0xTest2');
    console.log(`\nTEST 2: price=0.95 BUY → score=${score2} (should be 0 - FOMO KILL)`);
    console.log(score2 === 0 ? '✅ PASS' : '❌ FAIL');

    // Test 3: High price SELL should still work (not FOMO)
    const sellTrade: TradeData = {
        amountUSD: 1000,
        isNewMarket: false,
        price: 0.95,
        side: 'SELL',
        marketSlug: 'test-market-sell',
        outcome: 'Yes'
    };
    const score3 = await analysisService.calculateScore(mockWhale, sellTrade, '0xTest3');
    console.log(`\nTEST 3: price=0.95 SELL → score=${score3} (should be > 0 - SELL is OK)`);
    console.log(score3 > 0 ? '✅ PASS' : '❌ FAIL');

    console.log('\n=== TESTS COMPLETE ===');
    process.exit(0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
