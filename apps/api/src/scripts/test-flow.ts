
import { PolymarketIngestor } from '../ingestor';
import { PrismaClient } from '@whalescope/db';
import axios from 'axios';

const prisma = new PrismaClient();
const ingestor = new PolymarketIngestor();

async function runTest() {
    console.log('🧪 Starting Integration Test...');

    // 0. Cleanup Previous Run
    console.log('🧹 Cleaning up previous test data...');
    try {
        await prisma.signal.delete({ where: { txHash: '0xTestHash001' } });
        console.log('   Deleted old test signal.');
    } catch (e) {
        // Ignore if not exists
    }

    // 1. Setup Test Market in Ingestor Cache
    console.log('🔹 Setting up Test Market in Cache...');
    // Access private property via any cast
    (ingestor as any).marketCache.set('test-asset-id', {
        slug: 'test-market',
        question: 'Will AI verify this test?',
        conditionId: 'test-condition',
        outcome: 'Yes'
    });

    // 2. Simulate Trade
    console.log('🔹 Simulating Detective Trade...');
    const dummyTrade = {
        uniqueId: 'test-trade-001', // This might need to be adapted if the ingestor extracts ID differently
        transaction_hash: '0xTestHash001',
        asset_id: 'test-asset-id',
        price: '0.99', // should trigger FOMO_CHASE
        size: '1000',  // $990 volume
        side: 'BUY',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        maker_address: '0xTestWhaleAddress',
        type: 'FOK'
    };

    // The ingestor method expects a raw trade object from Polymarket API
    // We need to match the structure expected by `processDetectiveTrade`
    // Looking at ingestor.ts:
    // const uniqueId = trade.id || trade.transaction_hash || trade.match_id;
    // const price = Number(trade.price);

    await (ingestor as any).processDetectiveTrade(dummyTrade);

    // 3. Verify Database
    console.log('🔹 Verifying Database...');
    // Wait a moment for async DB operations if any (though await above should handle it)
    await new Promise(r => setTimeout(r, 1000));

    const signal = await prisma.signal.findFirst({
        where: { txHash: '0xTestHash001' },
        include: { whale: true }
    });

    if (!signal) {
        console.error('❌ DB Verification Failed: Signal not found.');
        process.exit(1);
    }

    console.log('✅ DB Record Found:', {
        id: signal.id,
        aiScore: signal.aiScore,
        tags: signal.tags,
        whale: signal.whaleAddress
    });

    if (signal.aiScore === 0) console.warn('⚠️ Warning: aiScore is 0');
    if (!signal.tags.includes('FOMO_CHASE')) console.warn('⚠️ Warning: Tag FOMO_CHASE missing');

    // 4. Verify API
    console.log('🔹 Verifying API Endpoint...');
    try {
        const response = await axios.get('http://localhost:3001/api/markets/test-market/sentiment');
        console.log('✅ API Response:', response.data);

        if (response.data.latestAiScore !== signal.aiScore) {
            console.error('❌ API Verification Failed: Score mismatch.');
        } else {
            console.log('✅ API & DB are in sync.');
        }

    } catch (error: any) {
        console.log('⚠️ API Request Failed. Is the server running?');
        console.log('   Run `npm run dev` in apps/api in another terminal.');
        console.log('   Error:', error.message);
    }

    console.log('🎉 Test Flow Complete.');
}

runTest()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
