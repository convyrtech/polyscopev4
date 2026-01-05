
import WebSocket from 'ws';
import axios from 'axios';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

async function main() {
    try {
        console.log("🔍 Finding active market...");
        // Fetch most active market
        const resp = await axios.get('https://gamma-api.polymarket.com/markets?active=true&limit=1&sort=volume');

        if (!resp.data || (Array.isArray(resp.data) && resp.data.length === 0)) {
            console.error("❌ No active markets found via Gamma API");
            process.exit(1);
        }

        const market = Array.isArray(resp.data) ? resp.data[0] : resp.data.data[0];

        if (!market || !market.clobTokenIds) {
            console.error("❌ Market data invalid:", JSON.stringify(market));
            process.exit(1);
        }

        const assetId = JSON.parse(market.clobTokenIds)[0];

        console.log(`🎯 Target: ${market.question} (${assetId})`);

        const ws = new WebSocket(WS_URL);

        ws.on('open', () => {
            console.log("✅ Connected to WS. Sending subscription...");
            const payload = { assets_ids: [assetId] };
            console.log("📤 Sending:", JSON.stringify(payload));
            ws.send(JSON.stringify(payload));
        });

        ws.on('message', (data) => {
            const msg = data.toString();
            console.log(`📩 Received: ${msg.slice(0, 100)}...`);

            try {
                const parsed = JSON.parse(msg);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        if (item.event_type === 'trade' || item.event_type === 'last_trade_price') {
                            console.log("\n🔥 RAW TRADE DETECTED:");
                            console.log(JSON.stringify(item, null, 2));
                            console.log("\n✅ Captured! Exiting...");
                            process.exit(0);
                        }
                    }
                }
            } catch (e) {
                console.error("❌ JSON Parse Error:", e);
            }
        });

        ws.on('error', (err) => {
            console.error("❌ WebSocket Error:", err);
        });

        ws.on('close', () => {
            console.log("⚠️ WebSocket Closed");
        });

        setTimeout(() => {
            console.log("⏳ Timeout (No trades in 10s).");
            process.exit(0);
        }, 10000);

    } catch (error) {
        console.error("❌ Fatal Error:", error);
        process.exit(1);
    }
}

main();
