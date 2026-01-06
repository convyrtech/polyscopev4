
import axios from 'axios';
import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();
const SLUG = 'will-the-us-invade-venezuela-in-2025';

async function main() {
    console.log(`🔍 DIAGNOSING SLUG: ${SLUG}`);

    // 1. Check Gamma - Is it an Event?
    console.log("\n--- 1. Checking Gamma API (Event) ---");
    try {
        const res = await axios.get(`https://gamma-api.polymarket.com/events`, { params: { slug: SLUG } });
        const events = res.data;
        if (Array.isArray(events) && events.length > 0) {
            console.log(`✅ FOUND EVENT: ${events[0].title}`);
            const markets = events[0].markets || [];
            console.log(`   Linked Markets: ${markets.length}`);
            markets.forEach((m: any) => console.log(`   - [Market] ${m.slug}`));
        } else {
            console.log("❌ Not found as Event.");
        }
    } catch (e: any) { console.log(`❌ Event Query Error: ${e.message}`); }

    // 2. Check Gamma - Is it a Market?
    console.log("\n--- 2. Checking Gamma API (Market) ---");
    try {
        const res = await axios.get(`https://gamma-api.polymarket.com/markets`, { params: { slug: SLUG } });
        const markets = Array.isArray(res.data) ? res.data : [res.data];
        if (markets.length > 0 && markets[0]?.question) {
            console.log(`✅ FOUND MARKET: ${markets[0].question}`);
            console.log(`   Slug: ${markets[0].slug}`);
        } else {
            console.log("❌ Not found as Market.");
        }
    } catch (e: any) { console.log(`❌ Market Query Error: ${e.message}`); }

    // 3. Check Database Signals
    console.log("\n--- 3. Checking Database Signals ---");
    const total = await prisma.signal.count();
    console.log(`Total Signals: ${total}`);

    // Check specific "pending" signals
    const pending = await prisma.signal.count({ where: { marketSlug: 'pending_resolution' } });
    console.log(`PENDING Signals: ${pending}`);

    // Group by Market Slug (Top 5)
    console.log("Top 5 Market Slugs in DB:");
    const grouped = await prisma.signal.groupBy({
        by: ['marketSlug'],
        _count: { _all: true },
        orderBy: { _count: { marketSlug: 'desc' } },
        take: 5
    });
    console.table(grouped);
}

main().finally(() => prisma.$disconnect());
