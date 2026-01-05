import { PrismaClient } from '@whalescope/db';
import axios from 'axios';

const GAMMA_URL = 'https://gamma-api.polymarket.com/markets';
const prisma = new PrismaClient();

export class ResolutionService {

    /**
     * Main loop to resolve Open Signals.
     * Should be called every ~10 minutes.
     */
    public async resolveSignals() {
        console.log('⚖️ [Judge] Starting Resolution Cycle...');

        // 1. Get all OPEN signals
        const openSignals = await prisma.signal.findMany({
            where: { status: 'OPEN' },
            distinct: ['marketSlug'] // Optimization: Group by market to save API calls
        });

        if (openSignals.length === 0) {
            console.log('⚖️ [Judge] No open signals to resolve.');
            return;
        }

        console.log(`⚖️ [Judge] Checking ${openSignals.length} active markets...`);

        // 2. Check Market Status via Gamma
        for (const sig of openSignals) {
            await this.checkMarket(sig.marketSlug);
        }
    }

    private async checkMarket(slug: string) {
        try {
            const res = await axios.get(`${GAMMA_URL}/${slug}`);
            const market = res.data;

            // Check if resolved
            if (market.resolved) { // Gamma field (verify exact field name)
                const winningOutcome = market.uma_resolution_result || market.resolution_price;
                // Note: UMA result might be "Yes", "No", or specific token ID.
                // For simplified logic, let's assume binary "Yes"/"No" or token string.

                await this.settleSignals(slug, winningOutcome);
            }
        } catch (e: any) {
            console.error(`⚖️ [Judge] Error checking ${slug}:`, e.message);
        }
    }

    private async settleSignals(slug: string, winningOutcome: string) {
        console.log(`⚖️ [Judge] Resolving ${slug}. Winner: ${winningOutcome}`);

        const signals = await prisma.signal.findMany({
            where: { marketSlug: slug, status: 'OPEN' }
        });

        for (const sig of signals) {
            let status = 'LOST';
            let roi = -100;

            // Simple Binary win check
            // If winningOutcome matches our 'outcome'
            // OR if winningOutcome is a number (1.0 = Yes, 0.0 = No)

            // Logic:
            // "1" or "Yes" -> Yes wins.
            // "0" or "No" -> No wins.

            // Normalize
            let winner = winningOutcome;
            if (winningOutcome === '1') winner = 'Yes';
            if (winningOutcome === '0') winner = 'No';

            if (sig.outcome === winner) {
                status = 'WON';
                // Estimate ROI based on entry price
                // Profit = (1 - price) / price * 100
                if (sig.price > 0) {
                    roi = ((1 - sig.price) / sig.price) * 100;
                }
            } else {
                // LOST
                // ROI is -100%
            }

            // Update Signal
            await prisma.signal.update({
                where: { id: sig.id },
                data: {
                    status: status,
                    roi: roi
                }
            });

            // Update Whale Stats
            await this.updateWhaleStats(sig.whaleAddress, status === 'WON', roi);
        }
    }

    private async updateWhaleStats(address: string, won: boolean, tradeRoi: number) {
        // Fetch current stats
        const whale = await prisma.whale.findUnique({ where: { address } });
        if (!whale) return;

        // Simple Rolling Average for Winrate
        // We'd ideally track totalSignals count, but let's approximate or use a separate counter
        // For zero-budget, let's just increment PnL and nudge Winrate.

        // Better: Recalculate from full history? 
        // "Zero-Budget" -> DB is local and fast. Let's recalculate accurately.

        const history = await prisma.signal.aggregate({
            where: { whaleAddress: address, status: { in: ['WON', 'LOST'] } },
            _count: true,
            _sum: { roi: true } // Crude PnL proxy
        });

        const wins = await prisma.signal.count({
            where: { whaleAddress: address, status: 'WON' }
        });

        const total = history._count;
        const newWinrate = total > 0 ? (wins / total) * 100 : 0;

        // PnL: Sum of (Amount * ROI%)? 
        // We stored 'amountUSD'. Net Profit = Amount * (ROI/100).
        // Let's do a raw SQL generic or just manual sum?
        // Let's stick to simple winrate updates for now to be safe.

        await prisma.whale.update({
            where: { address },
            data: {
                winrate: newWinrate,
                lastAnalyzed: new Date()
            }
        });
    }
}
