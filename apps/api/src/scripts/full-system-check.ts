import { PrismaClient } from '@whalescope/db';
import { StrategyService, StrategyType } from '../services/strategy.service';
import axios from 'axios';

const prisma = new PrismaClient();
const strategy = new StrategyService();

async function runCheck() {
    console.log("🕵️ STARTING FULL SYSTEM AUDIT...");

    // 1. DATA INGESTION CHECK
    console.log("\n1. [Data Ingestion] Checking Database...");
    const signalCount = await prisma.signal.count();
    const whaleCount = await prisma.whale.count();
    const recentSignal = await prisma.signal.findFirst({ orderBy: { timestamp: 'desc' } });

    console.log(`   - Total Signals: ${signalCount}`);
    console.log(`   - Total Whales: ${whaleCount}`);
    if (recentSignal) {
        console.log(`   - Last Signal: ${recentSignal.timestamp.toISOString()} (${recentSignal.marketSlug})`);
        const timeDiff = Date.now() - recentSignal.timestamp.getTime();
        // Allow up to 5 mins staleness (markets can be slow)
        if (timeDiff < 5 * 60 * 1000) console.log("   ✅ Data is flowing (Last signal < 5 min ago)");
        else console.warn(`   ⚠️ Data might be stale (Last signal ${(timeDiff / 60000).toFixed(1)} min ago)`);
    } else {
        console.error("   ❌ NO DATA FOUND.");
    }

    // 2. STRATEGY LOGIC CHECK (Venezuela Protocol)
    console.log("\n2. [Strategy] Verifying 'Venezuela Protocol'...");

    // Case A: Fresh Wallet ($1000) -> Should be INSIDER
    const freshWhale = { address: '0xNew', winrate: 0, pnl: 0, volume: 1000, tags: '' } as any;
    const insiderSignal = {
        price: 0.5, amountUSD: 1500, marketSlug: 'test', outcome: 'Yes',
        expiryDate: new Date(Date.now() + 86400000) // 1 day out
    };

    const resultA = strategy.evaluate(insiderSignal, freshWhale);
    if (resultA.strategy === StrategyType.INSIDER && resultA.action === 'BET') {
        console.log("   ✅ Case A (Fresh Wallet + Big Bet): PASSED (Identified as INSIDER)");
    } else {
        console.error(`   ❌ Case A FAILED. Got: ${JSON.stringify(resultA)}`);
    }

    // Case B: Time Filter (>7 days) on NORMAL whale -> Should be SKIP
    // Venezuela bypasses filters, so we use a "Normal" whale to test the filter.
    const longSignal = {
        price: 0.5, amountUSD: 1500, marketSlug: 'test', outcome: 'Yes',
        expiryDate: new Date(Date.now() + 8 * 86400000) // 8 days out
    };
    const normalWhale = { address: '0xOld', winrate: 50, pnl: 100, volume: 10000, tags: '' } as any;
    const resultC = strategy.evaluate(longSignal, normalWhale);

    if (resultC.action === 'SKIP' && resultC.reason.includes('Time Horizon')) {
        console.log("   ✅ Case B (Time Filter > 7 Days): PASSED (Skipped)");
    } else {
        console.error(`   ❌ Case B FAILED. Got: ${JSON.stringify(resultC)}`);
    }

    // 3. DISPLAY CHECK (API)
    console.log("\n3. [Display] Checking Frontend API...");
    try {
        // Check Leaderboard
        const res = await axios.get('http://localhost:3001/api/whales/leaderboard');
        if (Array.isArray(res.data)) {
            console.log(`   ✅ Leaderboard API: OK (Returned ${res.data.length} whales)`);
        } else {
            console.error("   ❌ Leaderboard API Malformed");
        }
    } catch (e: any) {
        console.error("   ❌ API Failed to Respond:", e.message);
    }
}

runCheck().catch(console.error);
