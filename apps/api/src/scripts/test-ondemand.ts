
import axios from 'axios';

async function runTest() {
    console.log('🧪 Starting On-Demand Tracking Test...');

    const randomSlug = `random-niche-market-${Math.floor(Math.random() * 10000)}`;
    const url = `http://localhost:3001/api/markets/${randomSlug}/sentiment`;

    console.log(`🔹 Requesting Unknown Market: ${randomSlug}`);

    try {
        const response = await axios.get(url);

        console.log('🔹 Response Status:', response.status);
        console.log('🔹 Response Data:', response.data);

        if (response.data.status === 'INITIALIZING') {
            console.log('✅ PASS: API returned INITIALIZING status.');
        } else {
            console.error('❌ FAIL: API did not return INITIALIZING status.');
            console.log('Expected { status: "INITIALIZING" }');
        }

    } catch (error: any) {
        console.error('❌ Request Failed:', error.message);
        if (error.code) console.error('   Code:', error.code);
        if (error.response) {
            console.error('   Server responded with:', error.response.status, error.response.data);
        } else {
            console.error('   (No response received)');
        }
    }
}

runTest();
