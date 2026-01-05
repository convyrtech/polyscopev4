import { WhaleService } from './services/whale.service';
import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

// A known active address (from previous generic search or leaderboards)
const TEST_ADDR = "0xe96562479e39ce670732860d4b68e9185a538260";

async function main() {
    console.log(`🧪 Testing WhaleService for ${TEST_ADDR}...`);

    // Clear cache to force analysis
    await prisma.whale.deleteMany({ where: { address: TEST_ADDR } });
    console.log("Deleted old record to bypass cache.");

    await WhaleService.queueAnalysis(TEST_ADDR);

    // Test Deduplication
    console.log("Pushing duplicate to test cache/queue dedup...");
    await WhaleService.queueAnalysis(TEST_ADDR);

    // Wait for async queue processing (it's background now)
    console.log("Waiting for background processing...");
    await new Promise(r => setTimeout(r, 5000));

    // Verify DB
    const whale = await prisma.whale.findUnique({
        where: { address: TEST_ADDR }
    });

    console.log("✅ Whale Record:", whale);
}

main().catch(console.error);
