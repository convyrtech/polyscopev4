import axios from 'axios';

async function verifyApi() {
    const slug = 'will-2025-be-the-hottest-year-on-record'; // Known slug from previous logs
    console.log(`🔍 Testing API for: ${slug}`);

    try {
        const res = await axios.get(`http://localhost:3001/api/markets/${slug}/sentiment`);
        const data = res.data;

        console.log('✅ API Response Received');
        console.log('------------------------------------------------');
        console.log(`Market: ${data.market}`);
        console.log(`Whale Count: ${data.whaleCount}`);
        console.log(`Bullish Vol: $${data.bullishVolume}`);
        console.log(`Bearish Vol: $${data.bearishVolume}`);

        console.log('\n🐋 Active Whales Roster (Extension Data):');
        if (data.activeWhales && Array.isArray(data.activeWhales)) {
            data.activeWhales.forEach((w: any, i: number) => {
                console.log(`   #${i + 1} [${w.alias || w.address.slice(0, 6)}] Vol: $${w.volume} WR: ${w.winrate}%`);
            });
            if (data.activeWhales.length === 0) console.log("   (No whales found in this mock/test)");
        } else {
            console.error('❌ CRITICAL: activeWhales field missing or invalid!');
            process.exit(1);
        }
        console.log('------------------------------------------------');

    } catch (e: any) {
        console.error('❌ API Verification Failed:', e.message);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Data:', e.response.data);
        }
    }
}

verifyApi();
