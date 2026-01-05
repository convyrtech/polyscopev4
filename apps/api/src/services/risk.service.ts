// Logger removed to avoid dependency issues during verification
// import { Logger } from '../lib/logger';

export class RiskService {
    private readonly BANKROLL = 10000; // Example fixed bankroll
    private readonly MAX_CAP_PERCENT = 0.05; // 5% Hard Cap

    /**
     * Calculates the optimal bet size using Quarter Kelly.
     */
    public calculateBetSize(
        winProb: number, // 0 to 1
        odds: number,    // Decimal odds (e.g. 2.0 for even money)
        category: string,
        marketSlug: string
    ): number {
        // Quarter Kelly Formula
        const b = odds - 1;
        const p = winProb;
        const q = 1 - p;

        if (b <= 0) return 0;

        let kellyFraction = (p * b - q) / b;
        kellyFraction *= 0.25;

        // If negative expectancy, don't bet
        if (kellyFraction <= 0) return 0;

        // Apply Hard Cap
        if (kellyFraction > this.MAX_CAP_PERCENT) {
            kellyFraction = this.MAX_CAP_PERCENT;
        }

        let betSize = this.BANKROLL * kellyFraction;

        // =====================================================================
        // 🚀 AGGRESSIVE MULTIPLIERS (Jan 2026 Audit)
        // =====================================================================

        const lowerCat = category?.toLowerCase() || '';

        let multiplier = 1.0;

        // 1. POLITICS: The Alpha (ROI +435%) -> 2.0x
        if (lowerCat.includes('politics') || lowerCat.includes('election')) {
            multiplier = 2.0;
        }
        // 2. CRYPTO: Reliable (+$33k) -> 1.5x
        else if (lowerCat.includes('crypto') || lowerCat.includes('bitcoin') || lowerCat.includes('ethereum')) {
            multiplier = 1.5;
        }

        betSize *= multiplier;

        // Re-check Hard Cap (Absolute Max Risk rule?)
        // If we want to allow "Overbetting" for high conviction, we might relax this.
        // But "Hard Cap" usually implies safety. 
        // However, user said "Politics Bets are now 2x size". 
        // If 2x Kelly exceeds 5%, do we cap it? 
        // Using "Quarter Kelly" * 2.0 is effectively "Half Kelly".
        // It is still safe enough. "5% Hard Cap" was a Task 1 rule. 
        // I will treat the Hard Cap as a limit on the *Base* Kelly, but let Multipliers push it slightly?
        // NO, "Hard Cap" usually means "Never lose more than X in one trade".
        // I will cap the final amount at 10% for these boosted trades to be safe?
        // Or stick to 5%. If 5% is the absolute limit, 2x multiplier hits it faster.
        // I will strict cap at 5% to be safe unless told otherwise.

        const maxBet = this.BANKROLL * this.MAX_CAP_PERCENT;
        if (betSize > maxBet) {
            betSize = maxBet;
        }

        return Math.floor(betSize * 100) / 100;
    }
}
