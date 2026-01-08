
// MOCK DATA
const mockSignal = {
    marketSlug: 'test-market-slug',
    aiScore: 50,
    price: 0.90,
    amountUSD: 1000,
    whaleAddress: '0x123'
};

const mockStrategies = [
    {
        name: "Vacuum Cleaner",
        config: { minScore: 10 }
    },
    {
        name: "Insider Follower",
        config: { minScore: 80 }
    },
    {
        name: "Contrarian Fade",
        config: { maxPrice: 0.40 } // Price must be <= 0.40
    }
];

console.log("🔍 Starting Filter Audit...");
console.log("Signal:", mockSignal);

let passedCount = 0;

for (const strategy of mockStrategies) {
    const config = strategy.config as any;
    let accepted = true;
    let rejectReason = "";

    // --- LOGIC FROM paper-trading.service.ts ---

    // Filter: Min Score
    const minScore = config.minScore !== undefined ? Number(config.minScore) : 0;
    if (mockSignal.aiScore < minScore) {
        accepted = false;
        rejectReason = `Score ${mockSignal.aiScore} < Min ${minScore}`;
    }

    // Filter: Max Price
    if (config.maxPrice !== undefined) {
        const maxPrice = Number(config.maxPrice);
        if (accepted && mockSignal.price > maxPrice) {
            accepted = false;
            rejectReason = `Price ${mockSignal.price} > Max ${maxPrice}`;
        }
    }

    // Filter: Min Volume
    if (config.minVol !== undefined) {
        const minVol = Number(config.minVol);
        if (accepted && mockSignal.amountUSD < minVol) {
            accepted = false;
            rejectReason = `Vol ${mockSignal.amountUSD} < Min ${minVol}`;
        }
    }

    // --- ASSERTIONS ---

    if (strategy.name === "Vacuum Cleaner") {
        if (accepted) console.log(`✅ Vacuum Cleaner: ACCEPTED (Correct)`);
        else console.error(`❌ Vacuum Cleaner: REJECTED (Expected Accept). Reason: ${rejectReason}`);
    }
    else if (strategy.name === "Insider Follower") {
        if (!accepted) console.log(`✅ Insider Follower: REJECTED (Correct). Reason: ${rejectReason}`);
        else console.error(`❌ Insider Follower: ACCEPTED (Expected Reject due to Low Score)`);
    }
    else if (strategy.name === "Contrarian Fade") {
        if (!accepted) console.log(`✅ Contrarian Fade: REJECTED (Correct). Reason: ${rejectReason}`);
        else console.error(`❌ Contrarian Fade: ACCEPTED (Expected Reject due to High Price)`);
    }

    if (accepted) passedCount++;
}

console.log("\n--------------------------------");
console.log("Audit Summary:");
// We expect exactly 1 pass (Vacuum) and 2 rejections.
if (passedCount === 1) {
    console.log("✅ FILTER LOGIC IS SOUND. Only target strategies triggered.");
} else {
    console.error("❌ FILTER LOGIC FAILED.");
}
