
import { AnalysisService, TradeData, WhaleData } from '../services/analysis.service';
import { PrismaClient } from '@whalescope/db';

// Mock Prisma
const prisma = new PrismaClient();
const service = new AnalysisService();

async function main() {
    console.log('🧪 Testing Aggressive Scoring Logic...\n');

    // Scenario 1: Fresh Whale (0 trades), High Volume ($2000)
    // Expected: Base(50) + Fresh(40) + Vol(20) = 110 -> Cap 100
    const freshWhale: WhaleData = { pnl: 0, winrate: 0, totalTrades: 0 };
    const bigTrade: TradeData = { amountUSD: 2000, isNewMarket: false, price: 0.5, side: 'BUY' };

    console.log('👉 Scenario 1: Fresh Whale + $2k Buy');
    const score1 = await service.calculateScore(freshWhale, bigTrade, '0xFreshWhale');
    console.log(`   Result: ${score1} (Expected 100)\n`);

    // Scenario 2: Old Whale (20 trades), Small Volume ($100)
    // Expected: Base(50) = 50
    const oldWhale: WhaleData = { pnl: 0, winrate: 0.5, totalTrades: 20 };
    const smallTrade: TradeData = { amountUSD: 100, isNewMarket: false, price: 0.5, side: 'BUY' };

    console.log('👉 Scenario 2: Old Whale + $100 Buy');
    const score2 = await service.calculateScore(oldWhale, smallTrade, '0xOldWhale');
    console.log(`   Result: ${score2} (Expected 50)\n`);

    // Scenario 3: Mega Whale (0 trades), Hugo Volume ($50k)
    // Expected: Base(50) + Fresh(40) + Vol(40) = 130 -> Cap 100
    const megaTrade: TradeData = { amountUSD: 50000, isNewMarket: false, price: 0.5, side: 'BUY' };
    console.log('👉 Scenario 3: Fresh Whale + $50k Buy');
    const score3 = await service.calculateScore(freshWhale, megaTrade, '0xMegaWhale');
    console.log(`   Result: ${score3} (Expected 100)\n`);
}

main();
