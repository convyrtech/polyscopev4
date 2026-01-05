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
        // 🇻🇪 STEP 2: THE VENEZUELA PROTOCOL (Fresh Wallet Bypass)
        // =====================================================================
        // Logic: New/Virgin Wallet + Large Bet ($1000+) = INSIDER INFO.
        // We bypass Liquidity/Price checks for this.

        const isFreshWallet = (whale.winrate === 0 && whale.pnl === 0); // No history
        const isLargeBet = signal.amountUSD >= 1000;

        if (isFreshWallet && isLargeBet) {
            // 🚀 BYPASS: The "Ghost Insider"
            // Assuming they know something we don't.
            return {
                strategy: StrategyType.INSIDER,
                action: 'BET',
                confidence: 0.95, // Max Confidence
                reason: 'VENEZUELA PROTOCOL: Fresh Wallet Big Bet'
            };
        }

        // =====================================================================
        // 🛡️ STEP 3: REALITY FILTERS (Liquidity & Time)
        // =====================================================================
        // Only apply these to standard trades (non-Venezuela).

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
        // 🎯 STEP 4: STRATEGY MATCHING
        // =====================================================================

        const isCrypto = lowerCat.includes('crypto') || lowerCat.includes('bitcoin') || lowerCat.includes('ethereum');
        const isPolitics = lowerCat.includes('politics') || lowerCat.includes('election');

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

        // 👻 INSIDER (Politics Specialist)
        // Logic: Bet > $2000 & Price < 0.40 (Adjusted from 0.20 since floor is 0.20).
        // Boost: Politics & Amount > 1000 -> 90%.

        const isPoliticsInsider = isPolitics && signal.amountUSD > 1000;

        if (isPoliticsInsider) {
            return { strategy: StrategyType.INSIDER, action: 'BET', confidence: 0.90, reason: 'Politics Insider' };
        }

        if (signal.amountUSD > 2000) {
            // Generic Insider
            return { strategy: StrategyType.INSIDER, action: 'BET', confidence: 0.75, reason: 'Large Whale Bet' };
        }

        // 🌊 TREND
        // Placeholder

        // Default
        return { strategy: StrategyType.NONE, action: 'SKIP', confidence: 0, reason: 'No Strategy Matched' };
    }
}
