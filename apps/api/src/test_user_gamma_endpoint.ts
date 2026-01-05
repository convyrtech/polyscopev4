import axios from 'axios';

// User suggested: https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=50&sort=volume
const URL = 'https://gamma-api.polymarket.com/markets';

async function main() {
    console.log(`Testing Gamma Markets Endpoint: ${URL}`);
    try {
        const resp = await axios.get(URL, {
            params: {
                active: true,
                closed: false,
                limit: 10,
                sort: 'volume', // User said 'sort', previous I used 'order'. Let's check.
                order: 'volume', // Adding both just in case, or checking response
                ascending: false
            }
        });

        const data = resp.data;
        if (Array.isArray(data)) {
            console.log(`✅ Received ${data.length} items.`);
            const m = data[0];
            console.log("Sample Market Keys:", Object.keys(m));
            console.log("Sample Market:", JSON.stringify(m, null, 2));
        } else {
            console.log("❌ Received non-array:", data);
        }

    } catch (e) {
        console.error("❌ Error:", e.message);
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", e.response.data);
        }
    }
}

main();
