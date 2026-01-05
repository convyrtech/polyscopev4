import axios from 'axios';

const GAMMA_URL = 'https://gamma-api.polymarket.com/events';

async function main() {
    console.log("🔍 Fetching Markets from Gamma API (Descending Volume)...");
    try {
        const response = await axios.get(GAMMA_URL, {
            params: {
                limit: 10,
                active: true,
                closed: false,
                order: 'volume',
                ascending: false // Force descending
            }
        });

        const events = response.data;

        console.log(`Received ${events.length} events.`);

        const now = new Date();

        events.forEach((e, i) => {
            console.log(`\n[${i + 1}] ${e.title}`);
            console.log(`   Volume: $${e.volume}`); // Event volume

            if (e.markets && e.markets.length > 0) {
                const m = e.markets[0];
                console.log(`   Market Slug: ${m.slug || 'N/A'}`);
                console.log(`   End Date: ${m.endDate}`);
                console.log(`   CLOB Token ID: ${m.clobTokenIds ? m.clobTokenIds[0] : 'N/A'}`);

                // Check future
                const end = new Date(m.endDate);
                const isFuture = end > now;
                console.log(`   isFuture: ${isFuture}`);
            }
        });

    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
