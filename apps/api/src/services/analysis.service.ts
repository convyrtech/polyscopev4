
import { PrismaClient } from '@whalescope/db';
import logger from '../lib/logger';

const prisma = new PrismaClient();

export interface WhaleData {
    pnl: number;
    winrate: number; // 0 to 1
    totalTrades: number;
}

export enum TradePattern {
    SMART_ENTRY = 'SMART_ENTRY',
    FOMO_CHASE = 'FOMO_CHASE',
    PANIC_SELL = 'PANIC_SELL',
    WHALE_EXIT = 'WHALE_EXIT',
    NORMAL = 'NORMAL'
}

export interface TradeData {
    amountUSD: number;
    isNewMarket: boolean;
    price: number;
    side: 'BUY' | 'SELL';
}

export class AnalysisService {
    async calculateScore(whale: WhaleData, trade: TradeData, whaleAddress?: string): Promise<number> {
        let score = 50; // Base Score
        const debugLog: any = { baseScore: 50 };

        // 1. Freshness Override (Aggressive)
        // Rule: If new account (<= 5 trades), assume burner/insider.
        if (whale.totalTrades <= 5) {
            score += 40;
            debugLog.freshnessBonus = 40;
        }

        // 2. Volume Sensitivity
        // Rule: >1k (+20), >5k (+30), >10k (+40)
        let volBonus = 0;
        if (trade.amountUSD >= 10000) volBonus = 40;
        else if (trade.amountUSD >= 5000) volBonus = 30;
        else if (trade.amountUSD >= 1000) volBonus = 20;

        if (volBonus > 0) {
            score += volBonus;
            debugLog.volumeBonus = volBonus;
        }

        // 3. PnL Modifier (Legacy but kept)
        if (whale.pnl > 0) {
            const bonus = Math.min(Math.floor(whale.pnl / 10000) * 10, 30);
            score += bonus;
            debugLog.pnlBonus = bonus;
        } else if (whale.pnl < 0) {
            const penalty = Math.min(Math.floor(Math.abs(whale.pnl) / 10000) * 20, 45); // Strict penalty for losers
            score -= penalty;
            debugLog.pnlPenalty = penalty;
        }

        // 4. Winrate Modifier
        if (whale.winrate > 0.60) {
            score += 20;
            debugLog.winrateBonus = 20;
        }

        // 5. New Market Bonus
        if (trade.isNewMarket) {
            score += 15;
            debugLog.newMarketBonus = 15;
        }

        // Clamp 0-100
        const finalScore = Math.max(0, Math.min(100, score));

        // [SIDE EFFECT] Whale Tagging
        if (finalScore >= 85 && whaleAddress) {
            try {
                // Check if already tagged to avoid unnecessary writes? 
                // Just update for now.
                // We append or set? Prompt says: set tags to "POSSIBLE_INSIDER"
                // Let's protect existing tags though.
                // Actually prompt says "set tags to...", implying overwrite or specific status.
                // I will append if not present.

                const currentTags = await prisma.whale.findUnique({
                    where: { address: whaleAddress },
                    select: { tags: true }
                });

                let newTags = currentTags?.tags || '';
                if (!newTags.includes('POSSIBLE_INSIDER')) {
                    newTags = newTags ? `${newTags},POSSIBLE_INSIDER` : 'POSSIBLE_INSIDER';

                    await prisma.whale.update({
                        where: { address: whaleAddress },
                        data: { tags: newTags }
                    });
                    debugLog.tagUpdate = "POSSIBLE_INSIDER";
                }
            } catch (e) {
                console.warn('⚠️ Failed to tag insider:', e);
            }
        }

        // Build log string for clarity
        const breakdown = Object.entries(debugLog)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' + ');

        logger.info(`🎯 [Score] ${finalScore} | ${breakdown}`);

        return finalScore;
    }

    classifyTrade(trade: TradeData): TradePattern {
        let pattern = TradePattern.NORMAL;

        if (trade.side === 'BUY') {
            if (trade.price > 0.90) pattern = TradePattern.FOMO_CHASE;
            else if (trade.price < 0.10) pattern = TradePattern.SMART_ENTRY;
        } else if (trade.side === 'SELL') {
            if (trade.price < 0.30) pattern = TradePattern.PANIC_SELL;
            else if (trade.price > 0.70) pattern = TradePattern.WHALE_EXIT;
        }

        logger.debug('AnalysisService.classifyTrade', {
            trade: { side: trade.side, price: trade.price },
            pattern
        });

        return pattern;
    }
}
