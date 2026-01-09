
import { PrismaClient } from '@whalescope/db';
import logger from '../lib/logger';
import { SyndicateService } from './syndicate.service';

const prisma = new PrismaClient();
const syndicateService = SyndicateService.getInstance();

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
    marketSlug?: string;  // For kill switch filtering
}

// ============================================================================
// KILL SWITCH CONSTANTS
// ============================================================================
const SPORTS_KEYWORDS = [
    'nba', 'nfl', 'nhl', 'mlb', 'mls',
    'tennis', 'atp', 'wta',
    'soccer', 'football', 'premier-league', 'bundesliga', 'serie-a', 'la-liga', 'champions-league',
    'ufc', 'mma', 'boxing',
    'cricket', 'ipl',
    'f1', 'formula', 'nascar',
    'golf', 'pga',
    'hockey', 'baseball', 'basketball',
    'esports', 'cs2', 'dota', 'lol',
    'game-', '-game', 'match', 'vs-', '-vs'
];

const MIN_TRADE_AMOUNT = 500; // Liquidity Gate: $500 minimum

export class AnalysisService {
    /**
     * Check if market slug indicates a sports event
     */
    private isSportsMarket(slug: string): boolean {
        const lowerSlug = slug.toLowerCase();
        return SPORTS_KEYWORDS.some(keyword => lowerSlug.includes(keyword));
    }

    async calculateScore(whale: WhaleData, trade: TradeData, whaleAddress?: string): Promise<number> {
        const marketSlug = trade.marketSlug || '';
        const debugLog: any = { market: marketSlug.substring(0, 30) };

        // ====================================================================
        // KILL SWITCH 1: LIQUIDITY GATE
        // ====================================================================
        if (trade.amountUSD < MIN_TRADE_AMOUNT) {
            logger.info(`⛔ [Filter] Low Liquidity: $${trade.amountUSD.toFixed(0)} < $${MIN_TRADE_AMOUNT} | ${marketSlug.substring(0, 40)}`);
            return 0;
        }

        // ====================================================================
        // KILL SWITCH 2: SPORTS FILTER (with Syndicate Bypass)
        // ====================================================================
        if (this.isSportsMarket(marketSlug)) {
            // Check for syndicate activity - if multiple whales, it's valuable
            const isSyndicate = await syndicateService.isSyndicateMove(marketSlug);

            if (!isSyndicate) {
                logger.info(`⛔ [Filter] Sports Event: ${marketSlug.substring(0, 50)} | No Syndicate`);
                return 0;
            }

            // Syndicate detected - allow but log
            debugLog.syndicateBypass = true;
            logger.info(`✅ [Syndicate] Sports ALLOWED: ${marketSlug.substring(0, 40)} | Multiple Whales`);
        }

        // ====================================================================
        // SCORING LOGIC (Only reached if passed kill switches)
        // ====================================================================
        let score = 50; // Base Score
        debugLog.baseScore = 50;

        // 1. Freshness Override (Aggressive)
        if (whale.totalTrades <= 5) {
            score += 40;
            debugLog.freshnessBonus = 40;
        }

        // 2. Volume Sensitivity
        let volBonus = 0;
        if (trade.amountUSD >= 10000) volBonus = 40;
        else if (trade.amountUSD >= 5000) volBonus = 30;
        else if (trade.amountUSD >= 1000) volBonus = 20;

        if (volBonus > 0) {
            score += volBonus;
            debugLog.volumeBonus = volBonus;
        }

        // 3. PnL Modifier
        if (whale.pnl > 0) {
            const bonus = Math.min(Math.floor(whale.pnl / 10000) * 10, 30);
            score += bonus;
            debugLog.pnlBonus = bonus;
        } else if (whale.pnl < 0) {
            const penalty = Math.min(Math.floor(Math.abs(whale.pnl) / 10000) * 20, 45);
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

        // Build log string
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
