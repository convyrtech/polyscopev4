// ============================================================================
// ALPHA MATRIX v2 - Sophisticated Whale Signal Scoring Engine
// Now uses REAL data from Polymarket API (closed positions only)
// ============================================================================

import { prisma } from '@whalescope/db';
import logger from '../lib/logger';
import { SyndicateService } from './syndicate.service';
import { fundingService, FundingAnalysis } from './funding.service';
import { polymarketDataService, ReliableStats } from './polymarket-data.service';
import {
    MIN_TRADE_AMOUNT_USD,
    SNIPER_WINRATE_THRESHOLD,
    LOSER_WINRATE_THRESHOLD,
    SHARK_PNL_THRESHOLD,
    FRESH_WALLET_VOLUME_THRESHOLD,
    WASH_TRADER_MIN_VOLUME,
    WASH_TRADER_MAX_ROI,
    SPAMMER_MIN_TRADES,
    VOLUME_SCORE_THRESHOLDS,
    PROVEN_WEIGHTS,
    FRESH_WEIGHTS,
    UNKNOWN_WEIGHTS,
    FOMO_PRICE_THRESHOLD,
    SMART_ENTRY_THRESHOLD,
    PANIC_SELL_THRESHOLD,
    WHALE_EXIT_THRESHOLD
} from '../lib/constants';

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
    marketSlug?: string;
    outcome?: string;
}

// ============================================================================
// LOCAL CONSTANTS (Not worth exporting - internal logic only)
// ============================================================================
const MIN_TRADES_FOR_EVAL = 10;
const FRESH_WALLET_MAX_TRADES = 3;
const SPAMMER_MAX_AVG_BET = 10;

// Import centralized SPORTS_KEYWORDS from constants
import { SPORTS_KEYWORDS } from '../lib/constants';

export class AnalysisService {
    private isSportsMarket(slug: string): boolean {
        const lowerSlug = slug.toLowerCase();
        return SPORTS_KEYWORDS.some((keyword: string) => lowerSlug.includes(keyword));
    }

    /**
     * ========================================================================
     * ALPHA MATRIX SCORE CALCULATOR
     * ========================================================================
     * Weights: Performance (Track Record) + Insider Score (Funding) + Volume
     * 
     * VALIDATION RULES:
     * - Hamster (WR<40%) buying $10k → Score 0 (KILL)
     * - Sniper (WR≥65%) buying $500 → Score 90+ (TRUST)
     * - Fresh Wallet from Tornado → Score 100 (MAX ALERT)
     */
    async calculateScore(whale: WhaleData, trade: TradeData, whaleAddress?: string): Promise<number> {
        const marketSlug = trade.marketSlug || '';
        const outcome = trade.outcome || '';

        // DEBUG: Log all incoming trades
        console.log(`🔍 [Alpha] Eval: ${whaleAddress?.substring(0, 10)}... | $${trade.amountUSD.toFixed(0)} on ${marketSlug.substring(0, 30)}`);

        // ====================================================================
        // PRIORITY INTERRUPT: SYNDICATE FORCE
        // ====================================================================
        if (marketSlug && outcome && syndicateService.isSyndicateActive(marketSlug, outcome)) {
            logger.info(`🦅 [Alpha] SYNDICATE FORCE 100: ${marketSlug.substring(0, 30)}`);
            return 100;
        }

        // ====================================================================
        // KILL SWITCH 1: LIQUIDITY GATE
        // ====================================================================
        if (trade.amountUSD < MIN_TRADE_AMOUNT_USD) {
            return 0;
        }

        // ====================================================================
        // KILL SWITCH 2: FOMO CHASER FILTER (Added 2025-01-25)
        // Problem: Buying at 0.95+ is FOMO - whale is chasing certainty
        // Math: ROI at price 0.99 = +1% win / -100% loss = SUICIDE
        // ====================================================================
        if (trade.side === 'BUY' && trade.price >= FOMO_PRICE_THRESHOLD) {
            logger.info(`🤡 [Alpha] FOMO KILL: BUY at price ${trade.price.toFixed(3)} >= ${FOMO_PRICE_THRESHOLD} | ${marketSlug.substring(0, 30)}`);
            return 0;
        }

        // ====================================================================
        // KILL SWITCH 3: SPORTS FILTER
        // ====================================================================
        if (this.isSportsMarket(marketSlug)) {
            const isSyndicate = await syndicateService.isSyndicateMove(marketSlug);
            if (!isSyndicate) return 0;
        }

        // ====================================================================
        // STEP 1: FETCH REAL DATA FROM POLYMARKET API
        // Uses ONLY closed-positions for reliable scoring
        // ====================================================================
        let realStats: ReliableStats | null = null;
        let funding: FundingAnalysis | null = null;

        if (whaleAddress) {
            // Fetch REAL stats from Polymarket Data API
            try {
                console.log(`📊 [Alpha] Fetching Polymarket stats for ${whaleAddress.substring(0, 10)}...`);
                realStats = await polymarketDataService.getReliableStats(whaleAddress);
                console.log(`📊 [Alpha] Stats result: ${realStats.closedTrades} closed, WR=${realStats.winrate.toFixed(1)}%, PnL=$${realStats.realizedPnL.toFixed(0)}`);
            } catch (e) {
                console.error(`[Alpha] Polymarket stats fetch failed: ${e}`);
            }

            // Fetch funding source
            try {
                funding = await fundingService.analyzeFunding(whaleAddress);
            } catch (e) {
                logger.warn(`[Alpha] Funding fetch failed: ${e}`);
            }
        }

        // ====================================================================
        // ANTI-BOT LAYER: Kill Wash Traders & Spammers
        // ====================================================================
        if (realStats && realStats.isReliable) {
            // KILL: Wash Trader (high volume, near-zero ROI)
            if (realStats.totalVolume > WASH_TRADER_MIN_VOLUME) {
                if (Math.abs(realStats.roi) < WASH_TRADER_MAX_ROI) {
                    logger.info(`🤖 [Alpha] WASH TRADER KILL: ${whaleAddress?.substring(0, 10)}... | Vol=$${realStats.totalVolume.toFixed(0)} ROI=${(realStats.roi * 100).toFixed(2)}%`);
                    return 0;
                }
            }

            // KILL: Spammer (many tiny trades)
            if (realStats.closedTrades > SPAMMER_MIN_TRADES && realStats.avgTradeSize < SPAMMER_MAX_AVG_BET) {
                logger.info(`🤖 [Alpha] SPAMMER KILL: ${whaleAddress?.substring(0, 10)}... | ${realStats.closedTrades} trades, avg=$${realStats.avgTradeSize.toFixed(2)}`);
                return 0;
            }
        }

        // ====================================================================
        // STEP 2A: PERFORMANCE SCORE (From REAL Polymarket Data)
        // ====================================================================
        let performanceScore = 50; // Neutral default
        let performanceStatus: 'PROVEN' | 'LOSER' | 'UNKNOWN' = 'UNKNOWN';

        if (realStats && realStats.isReliable) {
            // HAMSTER KILL SWITCH: Ignore losers regardless of volume
            if (realStats.winrate < LOSER_WINRATE_THRESHOLD) {
                logger.info(`🐹 [Alpha] HAMSTER KILL: ${whaleAddress?.substring(0, 10)}... WR=${realStats.winrate.toFixed(1)}% (${realStats.closedTrades} closed) | $${trade.amountUSD.toFixed(0)} IGNORED`);
                return 0;
            }

            // SNIPER: High winrate = proven winner
            if (realStats.winrate >= SNIPER_WINRATE_THRESHOLD) {
                performanceScore = 100;
                performanceStatus = 'PROVEN';
            }
            // DECENT: Moderate winrate
            else if (realStats.winrate >= 50) {
                performanceScore = 70;
                performanceStatus = 'PROVEN';
            }

            // SHARK OVERRIDE: High realized PnL
            if (realStats.realizedPnL >= SHARK_PNL_THRESHOLD) {
                performanceScore = 100;
                performanceStatus = 'PROVEN';
            }
        }

        // ====================================================================
        // STEP 2B: INSIDER SCORE (The Setup - Funding Source)
        // Uses funding.scoreBoost from FundingService:
        // - SUSPICIOUS_INSIDER: +40 (Tornado Cash = MAX ALPHA)
        // - WHALE: +20 (whale-to-whale = interesting)
        // - BRIDGE: +10 (obfuscating origin)
        // - PROTOCOL: 0 (DeFi = neutral)
        // - RETAIL: -10 (CEX direct = normie)
        // ====================================================================
        let insiderScore = 50; // Neutral baseline (50 + boost)

        if (funding) {
            // Use scoreBoost from FundingService (proper value, not hardcoded)
            insiderScore = 50 + funding.scoreBoost;
            
            // Clamp to 0-100
            insiderScore = Math.max(0, Math.min(100, insiderScore));
            
            // Special case: SUSPICIOUS_INSIDER gets max score
            if (funding.tag === 'SUSPICIOUS_INSIDER') {
                insiderScore = 100;
            }
        }

        // Fresh wallet bonus (if high volume)
        const isFreshWallet = !realStats || realStats.closedTrades <= FRESH_WALLET_MAX_TRADES;
        if (isFreshWallet && trade.amountUSD >= FRESH_WALLET_VOLUME_THRESHOLD) {
            insiderScore = Math.max(insiderScore, 80);
        }

        // ====================================================================
        // STEP 2C: VOLUME SIGNAL (The Conviction)
        // ====================================================================
        let volumeScore = VOLUME_SCORE_THRESHOLDS[VOLUME_SCORE_THRESHOLDS.length - 1].score; // Base
        for (const tier of VOLUME_SCORE_THRESHOLDS) {
            if (trade.amountUSD >= tier.minUSD) {
                volumeScore = tier.score;
                break;
            }
        }

        // ====================================================================
        // STEP 3: FINAL WEIGHTED LOGIC (The Alpha Matrix)
        // ====================================================================
        let finalScore: number;
        let mode: string;

        if (performanceStatus === 'PROVEN') {
            // TRUST THE WHALE - Performance is king
            finalScore = (performanceScore * PROVEN_WEIGHTS.performance) + 
                         (insiderScore * PROVEN_WEIGHTS.insider) + 
                         (volumeScore * PROVEN_WEIGHTS.volume);
            mode = 'PROVEN';
        } 
        else if (isFreshWallet) {
            // FRESH WALLET - Trust Funding + Volume
            finalScore = (insiderScore * FRESH_WEIGHTS.insider) + 
                         (volumeScore * FRESH_WEIGHTS.volume);
            mode = 'FRESH';
        }
        else {
            // UNKNOWN - Balanced approach
            finalScore = (performanceScore * UNKNOWN_WEIGHTS.performance) + 
                         (insiderScore * UNKNOWN_WEIGHTS.insider) + 
                         (volumeScore * UNKNOWN_WEIGHTS.volume);
            mode = 'UNKNOWN';
        }

        // Clamp to 0-100
        finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

        // ====================================================================
        // SIDE EFFECT: TAG HIGH SCORERS
        // ====================================================================
        if (finalScore >= 85 && whaleAddress) {
            try {
                const current = await prisma.whale.findUnique({
                    where: { address: whaleAddress },
                    select: { tags: true }
                });

                let tags = current?.tags || '';
                if (!tags.includes('POSSIBLE_INSIDER')) {
                    tags = tags ? `${tags},POSSIBLE_INSIDER` : 'POSSIBLE_INSIDER';
                    await prisma.whale.update({
                        where: { address: whaleAddress },
                        data: { tags }
                    });
                }
            } catch (e) {
                // Silent fail - tagging is non-critical
            }
        }

        // Log with breakdown
        const statsInfo = realStats?.isReliable 
            ? `WR=${realStats.winrate.toFixed(0)}% PnL=$${realStats.realizedPnL.toFixed(0)}` 
            : 'NO_STATS';
        const icon = finalScore >= 90 ? '🔥' : finalScore >= 70 ? '✅' : finalScore >= 50 ? '📊' : '⚪';
        logger.info(`${icon} [Alpha] ${finalScore} | ${whaleAddress?.substring(0, 10)}... | $${trade.amountUSD.toFixed(0)} | mode=${mode} | ${statsInfo} | ${funding?.tag || 'NO_FUNDING'}`);

        return finalScore;
    }

    classifyTrade(trade: TradeData): TradePattern {
        if (trade.side === 'BUY') {
            if (trade.price > FOMO_PRICE_THRESHOLD) return TradePattern.FOMO_CHASE;
            if (trade.price < SMART_ENTRY_THRESHOLD) return TradePattern.SMART_ENTRY;
        } else {
            if (trade.price < PANIC_SELL_THRESHOLD) return TradePattern.PANIC_SELL;
            if (trade.price > WHALE_EXIT_THRESHOLD) return TradePattern.WHALE_EXIT;
        }
        return TradePattern.NORMAL;
    }
}
