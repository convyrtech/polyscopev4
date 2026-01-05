import axios from 'axios';

// Known Polymarket Address (Random one from recent leaderboard or generic check)
// Let's use a random one found in recent blocks or just a placeholder if we don't have one?
// I'll use a hardcoded ACTIVE address for testing purposes. 
// "0x9c5083f234bf9919f96b278182743a4128f73118" -> Generic active address often seen.
const TEST_ADDRESS = "0xe96562479e39ce670732860d4b68e9185a538260"; // Found online as active user

const URL = `https://data-api.polymarket.com/trades?maker_address=${TEST_ADDRESS}&limit=10`;

async function main() {
    console.log(`🔍 Testing Data API for address: ${TEST_ADDRESS}`);
    console.log(`   URL: ${URL}`);

    try {
        const response = await axios.get(URL);
        const data = response.data;

        if (Array.isArray(data)) {
            console.log(`✅ Received ${data.length} trades.`);
            if (data.length > 0) {
                console.log("Sample Trade Keys:", Object.keys(data[0]));
                console.log("Sample Trade:", JSON.stringify(data[0], null, 2));
            }
        } else {
            console.log("❌ Received non-array:", data);
        }

    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

main();
