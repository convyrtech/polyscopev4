
import { PolymarketIngestor } from '../ingestor';
import { PrismaClient } from '@whalescope/db';
import axios from 'axios';

// Mock Config
const SLUG = 'will-the-us-invade-venezuela-in-2025';
const ASSET_ID = "28510305071001528588232263061858620884071686412926518442255373887747921822222"; // From dump

async function test() {
    const prisma = new PrismaClient();
    const ingestor = new PolymarketIngestor();

    console.log("🧪 STARTING MANUAL INGESTOR TEST");

    // 1. Test Tracking
    console.log(`\n[1] Tracking Market: ${SLUG}`);
    await ingestor.trackNewMarket(SLUG);

    // 2. Inspect Cache
    // We need to access private marketCache. using 'any' cast.
    const cacheSize = (ingestor as any).marketCache.size;
    console.log(`\n[2] Cache Size: ${cacheSize}`);

    const cached = (ingestor as any).marketCache.get(ASSET_ID);
    if (cached) {
        console.log("✅ Cache HIT for Asset ID!");
        console.log(`   Slug: ${cached.slug}`);
        console.log(`   Outcome: ${cached.outcome}`);
    } else {
        console.log("❌ Cache MISS for Asset ID. Dumping Keys...");
        const keys = Array.from((ingestor as any).marketCache.keys());
        console.log(keys.slice(0, 5)); // Show first 5
    }

    // 3. Simulate Trade
    console.log("\n[3] Simulating Trade");
    const mockTrade = {
        id: "test-trade-" + Date.now(),
        price: "0.5",
        size: "100",
        asset: ASSET_ID,
        maker_address: "0xTestUser",
        side: "BUY"
    };

    // We can't access private processDetectiveTrade directly without ts-ignore or cast
    // @ts-ignore
    await ingestor.processDetectiveTrade(mockTrade);

    // 4. Verify DB
    console.log("\n[4] Verifying Database");
    const signal = await prisma.signal.findFirst({
        where: { id: { contains: "test-trade" } },
        orderBy: { timestamp: 'desc' }
    });

    if (signal) {
        console.log("✅ Signal Saved!");
        console.log(`   Outcome: ${signal.outcome}`);
        console.log(`   MarketSlug: ${signal.marketSlug}`);

        if (signal.outcome !== 'UNK' && signal.marketSlug !== 'pending_resolution') {
            console.log("🎉 SUCCESS: Logic works!");
        } else {
            console.log("⚠️ FAILURE: Signal saved as UNK/Pending.");
        }
    } else {
        console.log("❌ FAILURE: Signal not saved.");
    }
}

test().catch(console.error);
