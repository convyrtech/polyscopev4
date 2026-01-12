import { prisma } from '@whalescope/db';
import axios from 'axios';
import { PaperTradingService } from './paper-trading.service';
import { ProfilerService } from './profiler.service';

const GAMMA_URL = 'https://gamma-api.polymarket.com/markets';

export class ResolutionService {
    private paperTradingService = PaperTradingService.getInstance();
    private profilerService = ProfilerService.getInstance();

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
                return;
            }

            // Events API returns an array. The market is inside the event.
            const event = res.data[0];
            const market = event.markets ? event.markets[0] : null;

            if (!market) return;

            // ================================================================
            // CONSTANTS FOR FLOAT COMPARISON
            // ================================================================
            const PRICE_EPSILON = 0.001;  // For detecting 1.0 or 0.0
            const VOID_EPSILON = 0.05;    // For detecting 0.5/0.5 (refund)

            // ================================================================
            // PARSE MARKET DATA
            // ================================================================

            // Parse outcomes array - format is "[\"Up\", \"Down\"]" or "[\"Yes\", \"No\"]"
            let outcomes: string[] = [];
            if (market.outcomes) {
                try {
                    outcomes = typeof market.outcomes === 'string'
                        ? JSON.parse(market.outcomes)
                        : market.outcomes;
                } catch (e) {
                    outcomes = ['Yes', 'No'];
                }
            }

            // Parse outcome prices - format is "[\"0.5\", \"0.5\"]" or "[\"1\", \"0\"]"
            let prices: number[] = [];
            if (market.outcomePrices) {
                try {
                    const parsed = typeof market.outcomePrices === 'string'
                        ? JSON.parse(market.outcomePrices)
                        : market.outcomePrices;
                    if (Array.isArray(parsed) && parsed.length >= 2) {
                        prices = parsed.map((p: string | number) => parseFloat(String(p)));
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }

            // ================================================================
            // HELPER FUNCTIONS
            // ================================================================
            const isNearOne = (p: number) => Math.abs(p - 1.0) < PRICE_EPSILON;
            const isNearZero = (p: number) => Math.abs(p - 0.0) < PRICE_EPSILON;
            const isVoidResolution = (priceArr: number[]): boolean => {
                // Both prices near 0.5 = refund scenario (market cancelled/voided)
                // STRICT CHECK: Only applies to binary markets (length === 2)
                return priceArr.length === 2 &&
                    Math.abs(priceArr[0] - 0.5) < VOID_EPSILON &&
                    Math.abs(priceArr[1] - 0.5) < VOID_EPSILON;
            };

            // ================================================================
            // PRIORITY 1: EXPLICIT RESOLUTION (resolved: true)
            // ================================================================
            if (market.resolved === true) {
                const winningOutcome = this.getWinningOutcome(market);

                if (winningOutcome) {
                    console.log(`⚖️ [Judge] ${slug} RESOLVED (explicit) → Winner: "${winningOutcome}"`);
                    await this.settleSignals(slug, winningOutcome);
                } else {
                    console.warn(`⚖️ [Judge] ${slug} resolved but winner ambiguous. UMA: ${market.uma_resolution_result}`);
                }
                return;
            }

            // ================================================================
            // PRIORITY 2-4: CLOSED MARKET SCENARIOS
            // ================================================================
            if (market.closed === true) {

                // PRIORITY 2: VOID/INVALID (both prices ≈ 0.5)
                // Valid only for Binary markets
                if (isVoidResolution(prices)) {
                    console.log(`⚖️ [Judge] ${slug} VOIDED (prices: ${prices}) → Refunding positions`);
                    await this.settleSignalsAsVoid(slug);
                    return;
                }

                // PRIORITY 3: IMPLICIT RESOLUTION (prices ≈ 1/0)
                if (prices.length >= 2) {
                    let implicitWinner: string | null = null;
                    const isBinary = prices.length === 2;

                    // Check for Explicit 1.0 (Works for Binary and Multi-outcome)
                    for (let i = 0; i < prices.length; i++) {
                        if (isNearOne(prices[i])) {
                            implicitWinner = outcomes[i] || (i === 0 ? 'Yes' : 'No');
                            break;
                        }
                    }

                    // If no explicit 1.0 found, check for implicit 0.0 (ONLY for Binary)
                    if (!implicitWinner && isBinary) {
                        if (isNearZero(prices[0])) {
                            // First outcome lost = second outcome won
                            implicitWinner = outcomes[1] || 'No';
                        } else if (isNearZero(prices[1])) {
                            // Second outcome lost = first outcome won
                            implicitWinner = outcomes[0] || 'Yes';
                        }
                    }

                    if (implicitWinner) {
                        console.log(`⚖️ [Judge] ${slug} IMPLICIT RESOLUTION (prices: ${prices}) → Winner: "${implicitWinner}"`);
                        await this.settleSignals(slug, implicitWinner);
                        return;
                    }
                }

                // PRIORITY 4: DISPUTED/WAITING (closed but outcome unclear)
                console.warn(`⚠️ [Judge] ${slug} DISPUTED: Market closed but outcome unclear. Prices: ${prices}. Waiting for oracle.`);
                // DO NOT SETTLE - position remains OPEN
                return;
            }

            // PRIORITY 5: ACTIVE MARKET (closed: false, resolved: false)
            // Skip silently - market still trading
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

        // [NEW] Profile all participants after resolution
        await this.profilerService.profileMarketParticipants(slug);
    }

    /**
     * Settle signals for a VOID/INVALID market (refund scenario)
     * Sets status to VOID with 0 ROI (no profit, no loss)
     */
    private async settleSignalsAsVoid(slug: string) {
        console.log(`⚖️ [Judge] Voiding ${slug}. All positions refunded.`);

        const signals = await prisma.signal.findMany({
            where: { marketSlug: slug, status: 'OPEN' }
        });

        for (const sig of signals) {
            // Update Signal to VOID status (no win, no loss)
            await prisma.signal.update({
                where: { id: sig.id },
                data: {
                    status: 'VOID',
                    roi: 0  // No profit, no loss
                }
            });

            // Note: We don't update whale stats for VOID signals
            // as they don't represent real trading performance
        }

        // Settle Paper Trading Positions as VOID (refund)
        await this.paperTradingService.onMarketVoid(slug);

        // Profile participants (optional for void markets)
        await this.profilerService.profileMarketParticipants(slug);
    }

    private async updateWhaleStats(address: string, won: boolean, tradeRoi: number) {
        // Fetch current stats
        const whale = await prisma.whale.findUnique({ where: { address } });
        if (!whale) return;

        // ================================================================
        // CALCULATE REAL PnL FROM ALL RESOLVED SIGNALS
        // PnL = Sum of (amountUSD * (roi / 100))
        // ================================================================

        // Get all resolved signals for this whale
        const resolvedSignals = await prisma.signal.findMany({
            where: {
                whaleAddress: address,
                status: { in: ['WON', 'LOST'] }
            },
            select: { amountUSD: true, roi: true }
        });

        // Calculate actual dollar PnL
        let totalPnL = 0;
        let wins = 0;
        const total = resolvedSignals.length;

        for (const sig of resolvedSignals) {
            if (sig.roi !== null && sig.roi !== undefined) {
                // For WON: roi is positive (profit %)
                // For LOST: roi is -100 (lost entire bet)
                totalPnL += sig.amountUSD * (sig.roi / 100);
            }
            if (sig.roi !== null && sig.roi > 0) {
                wins++;
            }
        }

        const newWinrate = total > 0 ? (wins / total) * 100 : 0;

        console.log(`📊 [Resolution] Updating ${address.substring(0, 10)}... | PnL: $${totalPnL.toFixed(2)} | WR: ${newWinrate.toFixed(1)}% (${wins}/${total})`);

        await prisma.whale.update({
            where: { address },
            data: {
                pnl: totalPnL,
                winrate: newWinrate,
                lastAnalyzed: new Date()
            }
        });
    }
}