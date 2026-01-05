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
    const scenarios: { name: string, signal: SignalCandidate, whaleOverride?: Whale }[] = [
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
            name: "✅ SCENARIO 2: The Radar Hit (Fresh Wallet + Big Bet)",
            whaleOverride: {
                address: '0xNEW',
                winrate: 0,
                pnl: 0,
                tags: '',
                volume: 0,
                lastActive: new Date()
            } as Whale,
            signal: {
                price: 0.40,
                amountUSD: 5000, // +40 Score
                marketSlug: 'new-market-radar',
                category: 'Business',
                title: 'Company Merger?',
                outcome: 'Yes',
                marketVolume: 50000 // +20 Score (Early)
            }
            // Logic: 40 (Fresh) + 40 (Size) + 20 (Timing) = 100 Score -> INSIDER
        },
        {
            name: "✅ SCENARIO 3: The Moderate Radar (Established but Early)",
            signal: {
                price: 0.55,
                amountUSD: 2500, // +30 Score
                marketSlug: 'us-election-2028',
                category: 'Politics',
                title: 'Presidential Election Winner',
                outcome: 'Yes',
                marketVolume: 40000 // +20 Score
            }
            // Logic: 0 (Not Fresh) + 30 (Size) + 20 (Timing) = 50 Score.
            // Result: likely SKIP or low confidence unless Politics logic overrides?
            // Politics Override logic is still there: Politics + >1000 = Insider (90%).
        },
        {
            name: "✅ SCENARIO 4: Reliable Gains (Crypto Sniper)",
            signal: {
                price: 0.60,
                amountUSD: 500,
                marketSlug: 'eth-etf-approval',
                category: 'Crypto',
                title: 'ETH ETF Approved?',
                outcome: 'Yes'
            }
        }
    ];

    for (const s of scenarios) {
        console.log(`--- ${s.name} ---`);
        const whale = s.whaleOverride || smartWhale;
        const result = strategyService.evaluate(s.signal, whale);

        console.log(`🧠 Decision: ${result.action} (${result.strategy})`);

        if (result.action === 'SKIP') {
            console.log(`🛑 Reason: ${result.reason}`);
        } else {
            console.log(`🔥 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
            if (result.reason) console.log(`ℹ️  Context: ${result.reason}`);

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
