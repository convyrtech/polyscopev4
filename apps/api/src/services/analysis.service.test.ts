import { describe, it, expect } from 'vitest';
import { AnalysisService, WhaleData, TradeData, TradePattern } from './analysis.service';

/**
 * AnalysisService Tests
 * 
 * NOTE: The scoring system now uses REAL Polymarket API data.
 * When no whaleAddress is provided, it falls back to "FRESH" mode
 * which gives baseline scores based on volume only.
 * 
 * Score ranges (FRESH mode, no API data):
 * - $500 trade: ~45 (base volume score)
 * - $1000 trade: ~50
 * - $5000 trade: ~75
 * - $50000 trade: ~100
 */
describe('AnalysisService', () => {
    const service = new AnalysisService();

    it('Case A: Large Bet = Higher Score (FRESH mode)', async () => {
        const whale: WhaleData = {
            pnl: 50000,
            winrate: 0.75,
            totalTrades: 100
        };
        const trade: TradeData = {
            amountUSD: 5000, // Large trade = higher volume score
            isNewMarket: false,
            price: 0.5,
            side: 'BUY'
        };

        const score = await service.calculateScore(whale, trade);
        // Without whaleAddress, uses FRESH mode → volume-based scoring
        expect(score).toBeGreaterThanOrEqual(50); // Large trade should score well
        expect(score).toBeLessThanOrEqual(100);
    });

    it('Case B: Small Trade = Lower Score (FRESH mode)', async () => {
        const whale: WhaleData = {
            pnl: -20000,
            winrate: 0.30,
            totalTrades: 50
        };
        const trade: TradeData = {
            amountUSD: 500, // Small trade
            isNewMarket: false,
            price: 0.5,
            side: 'BUY'
        };

        const score = await service.calculateScore(whale, trade);
        // FRESH mode with small trade = base score
        expect(score).toBeGreaterThanOrEqual(40);
        expect(score).toBeLessThanOrEqual(60);
    });

    it('Case C: New Whale (No history) = Base Score (FRESH mode)', async () => {
        const whale: WhaleData = {
            pnl: 0,
            winrate: 0,
            totalTrades: 0
        };
        const trade: TradeData = {
            amountUSD: 500,
            isNewMarket: false,
            price: 0.5,
            side: 'BUY'
        };

        const score = await service.calculateScore(whale, trade);
        // FRESH mode → base insider (50) + volume score
        expect(score).toBeGreaterThanOrEqual(40);
        expect(score).toBeLessThanOrEqual(60);
    });

    it('Case D: FOMO BUY at high price = Score 0', async () => {
        const whale: WhaleData = {
            pnl: 10000,
            winrate: 0.70,
            totalTrades: 50
        };
        const fomoTrade: TradeData = {
            amountUSD: 5000,
            isNewMarket: false,
            price: 0.95, // FOMO price
            side: 'BUY'
        };

        const score = await service.calculateScore(whale, fomoTrade);
        // FOMO KILL should return 0
        expect(score).toBe(0);
    });

    it('Case E: SELL at high price is OK (not FOMO)', async () => {
        const whale: WhaleData = {
            pnl: 10000,
            winrate: 0.70,
            totalTrades: 50
        };
        const sellTrade: TradeData = {
            amountUSD: 5000,
            isNewMarket: false,
            price: 0.95,
            side: 'SELL' // SELL is OK at high price
        };

        const score = await service.calculateScore(whale, sellTrade);
        // SELL is not FOMO → should get positive score
        expect(score).toBeGreaterThan(0);
    });

    describe('classifyTrade', () => {
        it('should classify FOMO_CHASE when buying at > 0.90', () => {
            const trade: TradeData = {
                amountUSD: 1000,
                isNewMarket: false,
                price: 0.95,
                side: 'BUY'
            };
            expect(service.classifyTrade(trade)).toBe(TradePattern.FOMO_CHASE);
        });

        it('should classify SMART_ENTRY when buying at < 0.10', () => {
            const trade: TradeData = {
                amountUSD: 1000,
                isNewMarket: false,
                price: 0.08,
                side: 'BUY'
            };
            expect(service.classifyTrade(trade)).toBe(TradePattern.SMART_ENTRY);
        });

        it('should classify PANIC_SELL when selling at < 0.10', () => {
            const trade: TradeData = {
                amountUSD: 1000,
                isNewMarket: false,
                price: 0.05,
                side: 'SELL'
            };
            expect(service.classifyTrade(trade)).toBe(TradePattern.PANIC_SELL);
        });

        it('should classify WHALE_EXIT when selling at > 0.90', () => {
            const trade: TradeData = {
                amountUSD: 1000,
                isNewMarket: false,
                price: 0.95,
                side: 'SELL'
            };
            expect(service.classifyTrade(trade)).toBe(TradePattern.WHALE_EXIT);
        });

        it('should classify NORMAL for regular trades', () => {
            const trade: TradeData = {
                amountUSD: 1000,
                isNewMarket: false,
                price: 0.50,
                side: 'BUY'
            };
            expect(service.classifyTrade(trade)).toBe(TradePattern.NORMAL);
        });
    });
});
