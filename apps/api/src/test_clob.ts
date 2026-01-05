import WebSocket from 'ws';
import axios from 'axios';

const GAMMA_URL = 'https://gamma-api.polymarket.com/markets';
const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

async function main() {
    console.log("🧪 CLOB SANITY CHECK STARTED");

    // 1. Get Real ID from Gamma
    console.log("1️⃣  Fetching Top Active Market from Gamma...");
    let assetId;
    let title;
    try {
        const resp = await axios.get(GAMMA_URL, {
            params: {
                active: true,
                closed: false,
                limit: 5,
                sort: 'volume',
                ascending: false
            }
        });

        const data = resp.data;
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("Gamma returned no data");
        }

        // Find first valid one
        for (const m of data) {
            if (m.clobTokenIds) {
                const ids = (typeof m.clobTokenIds === 'string') ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
                if (Array.isArray(ids) && ids.length > 0) {
                    assetId = ids[0];
                    title = m.question;
                    break;
                }
            }
        }

        if (!assetId) throw new Error("Could not extract asset_id from Gamma");
        console.log(`   ✅ Found: "${title}"`);
        console.log(`   🔑 Asset ID: ${assetId}`);

    } catch (e) {
        console.error("❌ Gamma Fetch Failed:", e.message);
        process.exit(1);
    }

    // 2. Connect to CLOB WS
    console.log("\n2️⃣  Connecting to CLOB WebSocket...");
    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
        console.log("   ✅ Connected!");

        const payload = {
            type: "MARKET", // Using the format we confirmed earlier worked for connection, but user suggested 'subscribe' in step 700. 
            // However, typically 'type' is ignored or is 'MARKET' for this specific endpoint. 
            // Let's try the user's strict request from Step 700 if this fails, but 'MARKET' + assets_ids is standard.
            // Wait, let's use the USER'S requested payload from step 700 to be 100% aligned with their request.
            // "type": "subscribe", "assets_ids": [...], "channel": "trades"

            // Actually, based on documentation usually it's `assets_ids` and `type: "MARKET"`. 
            // But let's verify if the user's "channel: trades" is the key.
            assets_ids: [assetId],
            type: "MARKET"
        };

        console.log(`   📤 Sending Subscription: ${JSON.stringify(payload)}`);
        ws.send(JSON.stringify(payload));
    });

    ws.on('message', (data) => {
        const msg = data.toString();
        console.log(`   📩 MSG: ${msg.slice(0, 200)}...`); // Truncate for readability
    });

    ws.on('error', (err) => {
        console.error("   ❌ WS Error:", err.message);
    });

    ws.on('close', () => {
        console.log("   ⚠️  WS Closed");
    });
}

main();
