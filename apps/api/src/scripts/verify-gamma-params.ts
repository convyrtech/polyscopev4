
import axios from 'axios';

const ASSET_ID = "217426331434639062905690501558262415330672727368976149504881568479499388364582";
// This is a known Asset ID. We will test if the API filters for it.

async function verify() {
    const url = `https://gamma-api.polymarket.com/markets?clob_token_id=${ASSET_ID}`;
    console.log(`TESTING URL: ${url}`);

    try {
        const res = await axios.get(url);
        const data = Array.isArray(res.data) ? res.data : [res.data];
        console.log(`Checking ${data.length} results...`);

        const m = data[0];
        if (!m) {
            console.log("❌ Response empty (Filter too strict or invalid)");
            return;
        }

        console.log(`First Result Slug: ${m.slug}`);

        let found = false;
        if (m.clobTokenIds) {
            const ids = (typeof m.clobTokenIds === 'string') ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
            if (ids.includes(ASSET_ID)) found = true;
        }

        if (found) {
            console.log("✅ FILTER WORKS! The returned market contains the requested Asset ID.");
        } else {
            console.log("❌ FILTER FAILED! Returned market DOES NOT contain the requested Asset ID.");
            console.log("   (API likely ignored the param and returned default list)");
        }

    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

verify();
