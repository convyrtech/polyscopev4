
import axios from 'axios';

const TRADE_API_URL = 'https://data-api.polymarket.com/trades';

async function auditData() {
    try {
        console.log("Fetching raw trades...");
        const response = await axios.get(TRADE_API_URL, {
            params: { limit: 1 }
        });

        if (Array.isArray(response.data) && response.data.length > 0) {
            const trade = response.data[0];
            console.log("RAW TRADE DATA KEYS:", Object.keys(trade));
            console.log("FULL OBJECT:", JSON.stringify(trade, null, 2));
        } else {
            console.log("No trades found.");
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

auditData();
