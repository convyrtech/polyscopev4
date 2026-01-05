import { Whale } from '@whalescope/db';

export enum StrategyType {
    SNIPER = 'SNIPER',
    INSIDER = 'INSIDER',
    TREND = 'TREND',
    NONE = 'NONE'
}

export interface SignalCandidate {
    price: number;
    amountUSD: number;
    marketSlug: string;
    category?: string;
    title?: string; // Market Question/Title
    outcome: string;
    // New fields for Venezuela Protocol
    expiryDate?: Date;
    marketVolume?: number; // Total market volume
}

export interface StrategyResult {
    strategy: StrategyType;
    action: 'BET' | 'SKIP';
    confidence: number;
    reason?: string;
}

export class StrategyService {

    public evaluate(signal: SignalCandidate, whale: Whale): StrategyResult {
        // =====================================================================
        // 🛑 STEP 1: THE KILL SWITCH (Global Gatekeepers)
        // =====================================================================

        const lowerCat = signal.category?.toLowerCase() || '';
        const lowerTitle = signal.title?.toLowerCase() || '';

        // 1. Sector Ban: Sports
        if (
            lowerCat.includes('sports') ||
            lowerCat.includes('nfl') ||
            lowerCat.includes('nba') ||
            lowerCat.includes('soccer') ||
            lowerTitle.includes('nfl') ||
            lowerTitle.includes('nba')
        ) {
            return { strategy: StrategyType.NONE, action: 'SKIP', confidence: 0, reason: 'KILL SWITCH: Sports Ban' };
        }

        // =====================================================================
        // 📡 STEP 2: INSIDER RADAR (PolySights Rival)
        // =====================================================================
        // Calculate "Radar Score" (0-100) based on Freshness, Conviction, Timing.

        const radarScore = this.calculateRadarScore(signal, whale);

        if (radarScore >= 80) {
            return {
                strategy: StrategyType.INSIDER,
                action: 'BET',
                confidence: 0.95, // High Confidence Insider
                reason: `RADAR SCORE: ${radarScore} (Detected High Conviction Insider)`
            };
        }

        if (radarScore >= 60) {
            return {
                strategy: StrategyType.INSIDER,
                action: 'BET',
                confidence: 0.75, // Moderate Confidence
                reason: `RADAR SCORE: ${radarScore} (Possible Insider Activity)`
            };
        }

        // =====================================================================
        // 🛡️ STEP 3: REALITY FILTERS (Liquidity & Time)
        // =====================================================================
        // Only apply these to standard trades (non-Insider).
        // Insiders bypass these checks (they know something).

        // 2. Time Horizon: Max 7 Days (Don't lock capital)
        if (signal.expiryDate) {
            const now = new Date();
            const daysToExpiry = (signal.expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
            if (daysToExpiry > 7) {
                return { strategy: StrategyType.NONE, action: 'SKIP', confidence: 0, reason: 'REALITY: Time Horizon > 7 Days' };
            }
        }

        // 3. Liquidity Filter: Market Volume > $10k
        if (signal.marketVolume && signal.marketVolume < 10000) {
            return { strategy: StrategyType.NONE, action: 'SKIP', confidence: 0, reason: 'REALITY: Low Liquidity' };
        }

        // 4. Price Floor: < 0.20 (Lottery Tickets)
        if (signal.price < 0.20) {
            return { strategy: StrategyType.NONE, action: 'SKIP', confidence: 0, reason: 'KILL SWITCH: Price < 0.20' };
        }

        // 5. Price Ceiling: > 0.85 (Low Upside)
        if (signal.price > 0.85) {
            return { strategy: StrategyType.NONE, action: 'SKIP', confidence: 0, reason: 'KILL SWITCH: Price > 0.85' };
        }

        // =====================================================================
        // 🎯 STEP 4: STRATEGY MATCHING (Legacy / Sniper)
        // =====================================================================

        const isCrypto = lowerCat.includes('crypto') || lowerCat.includes('bitcoin') || lowerCat.includes('ethereum');

        // 🔫 SNIPER (Crypto Specialist)
        // Logic: Whale Winrate > 55% & PnL > 1000.
        // Boost: If Crypto AND Whale is "SMART" (or high winrate/tags) -> 95% Confidence.

        if (whale.winrate > 55 && whale.pnl > 1000) {
            let confidence = 0.8;
            if (isCrypto && (whale.tags.includes('Smart') || whale.tags.includes('LEVIATHAN'))) {
                confidence = 0.95; // BOOST
            }
            return { strategy: StrategyType.SNIPER, action: 'BET', confidence, reason: 'Sniper Stats' };
        }

        // Default
        return { strategy: StrategyType.NONE, action: 'SKIP', confidence: 0, reason: 'No Strategy Matched' };
    }

    /**
     * Calculates the "Insider Radar" score (0-100).
     * Mimics PolySights logic: Freshness + Conviction + Timing.
     */
    private calculateRadarScore(signal: SignalCandidate, whale: Whale): number {
        let score = 0;

        // 1. FRESHNESS (Max 40)
        // Is this a "Burner Wallet"? (0 wins, 0 pnl, 0 volume before this?)
        // Note: Ingestor might have just created it with current volume, so check previous stats if possible.
        // For simplicity: if winrate is 0 and pnl is 0, it's unproven/fresh.
        const isFresh = (whale.winrate === 0 && whale.pnl === 0);
        if (isFresh) {
            score += 40;
        }

        // 2. CONVICTION (Max 40)
        // How much money are they risking?
        const amount = signal.amountUSD;
        if (amount >= 5000) {
            score += 40; // High Conviction
        } else if (amount >= 2000) {
            score += 30;
        } else if (amount >= 1000) {
            score += 20;
        } else if (amount >= 500) {
            score += 10;
        }

        // 3. TIMING (Max 20)
        // Are they early? (Low Market Volume)
        // If market volume is low (< $50k), big bets act as signals.
        const marketVol = signal.marketVolume || 0;
        if (marketVol < 100000) {
            score += 20; // Early Logic
        } else if (marketVol < 500000) {
            score += 10;
        }

        // Special Case: "The Venezuela Pattern" (Fresh + >$1k)
        // 40 (Fresh) + 20 (Conviction) = 60 (Minimum threshold met)

        // Special Case: "The Leviathan" (Fresh + >$5k + Early)
        // 40 + 40 + 20 = 100 (Perfect Score)

        return score;
    }
}
