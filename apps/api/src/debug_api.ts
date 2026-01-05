import axios from 'axios';

const REST_URL = 'https://clob.polymarket.com/markets';

async function main() {
    console.log("Fetching markets...");
    try {
        const resp = await axios.get(REST_URL, { params: { active: true, limit: 1 } });
        const markets = Array.isArray(resp.data) ? resp.data : resp.data.data;

        if (markets && markets.length > 0) {
            console.log("Market Object Keys:", Object.keys(markets[0]));
            console.log("Full Market Object:", JSON.stringify(markets[0], null, 2));

            if (markets[0].tokens) {
                console.log("Token Object:", JSON.stringify(markets[0].tokens[0], null, 2));
            }
        } else {
            console.log("No markets found");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
