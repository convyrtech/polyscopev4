import { StrategyService, SignalCandidate } from '../services/strategy.service';
import { RiskService } from '../services/risk.service';
import { Whale } from '@whalescope/db';

async function runSimulation() {
    console.log("🚀 Starting Strategy Engine Simulation...\n");

    const strategyService = new StrategyService();
    const riskService = new RiskService();

    // Mock Whale (Smart Insider)
    const smartWhale = {
        address: '0x123',
        alias: 'SmartMoney',
        winrate: 65,
        pnl: 5000,
        tags: 'Smart,LEVIATHAN',
        volume: 100000,
        score: 90,
        lastActive: new Date(),
        lastAnalyzed: new Date(),
        signals: [],
        followers: []
    } as unknown as Whale;

    // Scenarios
    const scenarios: { name: string, signal: SignalCandidate }[] = [
        {
            name: "❌ SCENARIO 1: The Trap (NFL Game)",
            signal: {
                price: 0.50,
                amountUSD: 1000,
                marketSlug: 'nfl-superbowl-2026',
                category: 'Sports', // BANNED
                title: 'Kansas City vs 49ers',
                outcome: 'Yes'
            }
        },
        {
            name: "❌ SCENARIO 2: Lottery Ticket (Price < 0.20)",
            signal: {
                price: 0.10, // BANNED
                amountUSD: 5000,
                marketSlug: 'long-shot-crypto',
                category: 'Crypto',
                title: 'Will BTC hit 200k?',
                outcome: 'Yes'
            }
        },
        {
            name: "✅ SCENARIO 3: The Alpha (Politics Insider)",
            signal: {
                price: 0.55,
                amountUSD: 2500, // > 1000 -> Insider Boost
                marketSlug: 'us-election-2028',
                category: 'Politics', // Multiplier 2.0x
                title: 'Presidential Election Winner',
                outcome: 'Yes'
            }
        },
        {
            name: "✅ SCENARIO 4: Reliable Gains (Crypto Sniper)",
            signal: {
                price: 0.60,
                amountUSD: 500,
                marketSlug: 'eth-etf-approval',
                category: 'Crypto', // Boosted Confidence + 1.5x
                title: 'ETH ETF Approved?',
                outcome: 'Yes'
            }
        }
    ];

    for (const s of scenarios) {
        console.log(`--- ${s.name} ---`);
        const result = strategyService.evaluate(s.signal, smartWhale);

        console.log(`🧠 Decision: ${result.action} (${result.strategy})`);

        if (result.action === 'SKIP') {
            console.log(`🛑 Reason: ${result.reason}`);
        } else {
            console.log(`🔥 Confidence: ${(result.confidence * 100).toFixed(0)}%`);

            // Calculate Risk
            const winProb = result.confidence;
            const odds = 1 / s.signal.price;

            const betSize = riskService.calculateBetSize(
                winProb,
                odds,
                s.signal.category || '',
                s.signal.marketSlug
            );

            console.log(`💰 Bet Size: $${betSize} (Input Criteria: ${s.signal.category} | $${s.signal.amountUSD})`);
        }
        console.log("");
    }
}

runSimulation();
