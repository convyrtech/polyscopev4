import axios from 'axios';
import WebSocket from 'ws';

const SLUG = 'super-bowl-2026'; // Target for test
const GAMMA_URL = 'https://gamma-api.polymarket.com/events'; // Note: Ingestor uses /events for slugs usually
const DATA_API_URL = 'https://data-api.polymarket.com/trades';
const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

async function verifyFlow() {
    console.log(`🔍 [1/3] CHECKING METADATA SOURCE (Gamma API) for slug: '${SLUG}'...`);

    let markets: any[] = [];
    try {
        // Test Event Endpoint
        const url = `${GAMMA_URL}?slug=${SLUG}`;
        console.log(`   GET ${url}`);
        const res = await axios.get(url);

        if (Array.isArray(res.data) && res.data.length > 0) {
            console.log(`   ✅ SUCCESS: Found Event ID: ${res.data[0].id}`);
            markets = res.data[0].markets;
            console.log(`   ✅ markets found: ${markets.length}`);
            markets.forEach(m => console.log(`      - Market: ${m.question} (ID: ${m.id})`));
        } else {
            console.error(`   ❌ FAIL: No event found for slug.`);
            return;
        }
    } catch (e: any) {
        console.error(`   ❌ FAIL: Gamma API Error: ${e.message}`);
        return;
    }

    if (markets.length === 0) return;

    // Pick first market
    const targetMarket = markets[0];
    // Asset ID (clobTokenIds)
    let assetId = '';
    try {
        const ids = JSON.parse(targetMarket.clobTokenIds);
        assetId = ids[0];
        console.log(`\n   🎯 Target Asset ID: ${assetId} (Outcome: ${targetMarket.tokens[0]?.outcome || 'UNK'})`);
    } catch (e) {
        console.error('   ❌ FAIL: Could not parse clobTokenIds');
        return;
    }

    console.log(`\n🔍 [2/3] CHECKING HISTORICAL DATA (Data API)...`);
    try {
        const url = `${DATA_API_URL}?asset_id=${assetId}&limit=5`;
        console.log(`   GET ${url}`);
        const res = await axios.get(url);

        if (Array.isArray(res.data) && res.data.length > 0) {
            console.log(`   ✅ SUCCESS: Retrieved ${res.data.length} trades.`);
            const t = res.data[0];
            console.log(`      - Sample Trade: ${t.side} ${t.size} @ ${t.price} (Time: ${t.timestamp})`);
        } else {
            console.warn(`   ⚠️ WARNING: No trades returned (Market might be inactive).`);
        }
    } catch (e: any) {
        console.error(`   ❌ FAIL: Data API Error: ${e.message}`);
    }

    console.log(`\n🔍 [3/3] CHECKING LIVE STREAM (WebSocket)...`);
    return new Promise<void>((resolve) => {
        const ws = new WebSocket(WS_URL);

        const timeout = setTimeout(() => {
            console.error(`   ❌ FAIL: WS Connection Timeout (5s)`);
            ws.terminate();
            resolve();
        }, 5000);

        ws.on('open', () => {
            console.log(`   ✅ SUCCESS: WS Connected!`);
            console.log(`   Sending generic subscription...`);
            ws.send(JSON.stringify({ assets_ids: [assetId] }));
        });

        ws.on('message', (data) => {
            console.log(`   ✅ SUCCESS: Received Message: ${data.toString().slice(0, 100)}...`);
            clearTimeout(timeout);
            ws.close();
            resolve();
        });

        ws.on('error', (e) => {
            console.error(`   ❌ FAIL: WS Error: ${e.message}`);
            clearTimeout(timeout);
            resolve();
        });
    });
}

verifyFlow();
