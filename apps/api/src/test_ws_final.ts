import WebSocket from 'ws';
import axios from 'axios';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const REST_URL = 'https://clob.polymarket.com/markets';

async function main() {
    console.log("🔄 Fetching valid asset ID...");
    const resp = await axios.get(REST_URL, { params: { active: true, limit: 10 } });
    const markets = Array.isArray(resp.data) ? resp.data : resp.data.data;

    let assetId = null;
    for (const m of markets) {
        if (m.tokens && m.tokens.length > 0) {
            assetId = m.tokens[0].token_id;
            break;
        }
    }

    if (!assetId) {
        console.error("❌ No Asset ID");
        return;
    }
    console.log("✅ Asset ID:", assetId);

    const payloads = [
        { name: "V1: No Type", data: { assets_ids: [assetId] } },
        { name: "V2: Lower Type", data: { type: "market", assets_ids: [assetId] } },
        { name: "V3: Upper Type", data: { type: "MARKET", assets_ids: [assetId] } },
        { name: "V4: Token IDs", data: { type: "MARKET", token_ids: [assetId] } },
        { name: "V5: Operation", data: { operation: "subscribe", assets_ids: [assetId] } },
        { name: "V6: Market Lower+Token", data: { type: "market", token_ids: [assetId] } }
    ];

    for (const p of payloads) {
        await testPayload(p.name, p.data);
    }
}

function testPayload(name: string, payload: any): Promise<void> {
    return new Promise((resolve) => {
        console.log(`\n🧪 Testing: ${name}`);
        const ws = new WebSocket(WS_URL);

        let success = false;

        const timeout = setTimeout(() => {
            if (!success) console.log(`⏳ Timeout (No Data)`);
            ws.terminate();
            resolve();
        }, 3000); // 3s timeout

        ws.on('open', () => {
            ws.send(JSON.stringify(payload));
        });

        ws.on('message', (data) => {
            const msg = data.toString();
            if (msg.includes("INVALID")) {
                console.log(`❌ FAILED: ${msg}`);
                clearTimeout(timeout);
                ws.terminate();
                resolve();
            } else {
                console.log(`✅ SUCCESS! Got Data: ${msg.slice(0, 50)}...`);
                success = true;
                clearTimeout(timeout);
                ws.terminate();
                resolve();
            }
        });

        ws.on('error', (e) => {
            console.log(`❌ Error: ${e.message}`);
            resolve();
        });
    });
}

main();
