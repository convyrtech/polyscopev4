import { PrismaClient } from '@whalescope/db';
import axios from 'axios';
import { PaperTradingService } from './paper-trading.service';

const GAMMA_URL = 'https://gamma-api.polymarket.com/markets';
const prisma = new PrismaClient();

export class ResolutionService {
    private paperTradingService = PaperTradingService.getInstance();

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
            // Polymarket API: Lookup by Event Slug
            const res = await axios.get(`https://gamma-api.polymarket.com/events`, {
                params: { slug }
            });

            if (!res.data || res.data.length === 0) {
                // console.warn(`⚖️ [Judge] Market/Event not found for slug: ${slug}`);
                return;
            }

            // Events API returns an array. The market is inside the event.
            // Simplified: We look for the market object within the event that matches our context,
            // or if it's a single market event, just take the first market.
            const event = res.data[0];
            const market = event.markets ? event.markets[0] : null;

            if (!market) return;


            if (market.resolved) {
                const winningOutcome = this.getWinningOutcome(market);

                if (winningOutcome) {
                    await this.settleSignals(slug, winningOutcome);
                } else {
                    console.warn(`⚖️ [Judge] ${slug} is resolved but winner is ambiguous. UMA: ${market.uma_resolution_result}`);
                }
            }
        } catch (e: any) {
            console.error(`⚖️ [Judge] Error checking ${slug}:`, e.message);
        }
    }

    private getWinningOutcome(market: any): string | null {
        // 1. Binary Markets (0, 0.5, 1) or "Yes"/"No"
        const res = market.uma_resolution_result || market.resolution_price;

        // Handle explicit binary result
        if (res === '1' || res === '1.0') return 'Yes';
        if (res === '0' || res === '0.0') return 'No';

        // 2. Multi-Outcome Markets (Token ID matching)
        if (market.tokens && Array.isArray(market.tokens)) {
            // A. Check if any token is explicitly marked winner (if Gamma supports this)
            const explicitWinner = market.tokens.find((t: any) => t.winner === true);
            if (explicitWinner) return explicitWinner.outcome;

            // B. Match UMA result (Token ID) to Outcome Label
            if (res) {
                const tokenMatch = market.tokens.find((t: any) => t.token_id === res);
                if (tokenMatch) return tokenMatch.outcome;
            }
        }

        // 3. Fallback: string match (if result is "Donald Trump")
        return typeof res === 'string' ? res : null;
    }

    private async settleSignals(slug: string, winningOutcome: string) {
        console.log(`⚖️ [Judge] Resolving ${slug}. Winner: "${winningOutcome}"`);

        const signals = await prisma.signal.findMany({
            where: { marketSlug: slug, status: 'OPEN' }
        });

        for (const sig of signals) {
            let status = 'LOST';
            let roi = -100;

            // Case-insensitive comparison
            const sigOutcome = (sig.outcome || '').trim().toLowerCase();
            const winner = winningOutcome.trim().toLowerCase();

            if (sigOutcome === winner) {
                status = 'WON';
                // Estimate ROI based on entry price (Assumes payout is $1.00)
                if (sig.price > 0) {
                    roi = ((1 - sig.price) / sig.price) * 100;
                }
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

        // [NEW] Settle Paper Trading Positions
        await this.paperTradingService.onMarketResolved(slug, winningOutcome);
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
