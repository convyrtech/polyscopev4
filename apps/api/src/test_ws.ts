import WebSocket from 'ws';
import axios from 'axios';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const REST_URL = 'https://clob.polymarket.com/markets';

async function main() {
    console.log("🔄 Fetching a valid asset ID...");
    try {
        const resp = await axios.get(REST_URL, { params: { active: true, limit: 10 } });
        // Handling both array directly or { data: [...] } structure
        const markets = Array.isArray(resp.data) ? resp.data : resp.data.data;

        if (!markets || markets.length === 0) {
            console.error("❌ No markets found");
            return;
        }

        let assetId = null;
        for (const m of markets) {
            if (m.tokens && m.tokens.length > 0) {
                assetId = m.tokens[0].token_id;
                break;
            }
        }

        if (!assetId) {
            console.error("❌ Could not fetch asset ID");
            return;
        }
        console.log("✅ Using Asset ID:", assetId);

        const ws = new WebSocket(WS_URL);

        ws.on('open', () => {
            console.log('✅ Connected to', WS_URL);

            // Test 1: Standard Docs Payload
            const payload1 = {
                type: "MARKET",
                assets_ids: [assetId]
            };

            console.log("Sending Payload 1 (MARKET)...");
            ws.send(JSON.stringify(payload1));
        });

        ws.on('message', (data) => {
            console.log("📩 Received:", data.toString().slice(0, 100));
        });

        ws.on('error', (err) => {
            console.error("❌ Error:", err.message);
        });

        ws.on('close', () => {
            console.log("⚠️ Disconnected");
        });
    } catch (e) {
        console.error("❌ Setup failed:", e.message);
    }
}

main();
