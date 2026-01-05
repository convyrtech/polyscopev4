import axios from 'axios';

const REST_URL = 'https://clob.polymarket.com/markets';

async function main() {
    console.log("🔍 Fetching Markets (Limit 50)...");
    try {
        // Emulate the logic in ingestor.ts but without active:true to test
        const response = await axios.get(REST_URL, {
            params: {
                limit: 50,
                closed: false
                // order: 'volume' // removing likely volume bias
            }
        });

        const markets = Array.isArray(response.data) ? response.data : response.data.data;

        console.log(`Received ${markets.length} raw markets.`);

        const now = new Date();
        const valid = markets.filter(m => {
            if (!m.end_date_iso) return false;
            // distinct future check
            return new Date(m.end_date_iso) > now;
        });

        console.log(`Found ${valid.length} FUTURE markets (ending > ${now.toISOString()}).`);

        valid.forEach((m, i) => {
            console.log(`\n[${i + 1}] ${m.question}`);
            console.log(`   Slug: ${m.market_slug}`);
            console.log(`   End: ${m.end_date_iso}`);
        });

    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
