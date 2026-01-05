import { describe, it, expect } from 'vitest';
import { AnalysisService, WhaleData, TradeData, TradePattern } from './analysis.service';

describe('AnalysisService', () => {
    const service = new AnalysisService();

    it('Case A: High PnL Whale + Large Bet = High Score (> 80)', () => {
        const whale: WhaleData = {
            pnl: 50000,    // +$50k
            winrate: 0.75, // 75%
            totalTrades: 100
        };
        const trade: TradeData = {
            amountUSD: 5000,
            isNewMarket: false,
            price: 0.5,
            side: 'BUY'
        };

        const score = service.calculateScore(whale, trade);
        expect(score).toBeGreaterThan(80);
    });

    it('Case B: Negative PnL Whale = Low Score (< 20)', () => {
        const whale: WhaleData = {
            pnl: -20000,   // -$20k
            winrate: 0.30, // 30%
            totalTrades: 50
        };
        const trade: TradeData = {
            amountUSD: 500, // Small trade
            isNewMarket: false,
            price: 0.5,
            side: 'BUY'
        };

        const score = service.calculateScore(whale, trade);
        expect(score).toBeLessThan(20);
    });

    it('Case C: New Whale (No history) = Neutral Score (approx 50-60)', () => {
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

        const score = service.calculateScore(whale, trade);
        expect(score).toBeGreaterThanOrEqual(50);
        expect(score).toBeLessThan(70);
    });

    it('Case D: "Sniper" (First trade in market) = Bonus points', () => {
        const whale: WhaleData = {
            pnl: 0,
            winrate: 0,
            totalTrades: 0
        };
        const normalTrade: TradeData = {
            amountUSD: 500,
            isNewMarket: false,
            price: 0.5,
            side: 'BUY'
        };
        const sniperTrade: TradeData = {
            amountUSD: 500,
            isNewMarket: true, // Sniper
            price: 0.5,
            side: 'BUY'
        };

        const normalScore = service.calculateScore(whale, normalTrade);
        const sniperScore = service.calculateScore(whale, sniperTrade);

        expect(sniperScore).toBeGreaterThan(normalScore);
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
                price: 0.05,
                side: 'BUY'
            };
            expect(service.classifyTrade(trade)).toBe(TradePattern.SMART_ENTRY);
        });

        it('should classify PANIC_SELL when selling at < 0.30', () => {
            const trade: TradeData = {
                amountUSD: 1000,
                isNewMarket: false,
                price: 0.20,
                side: 'SELL'
            };
            expect(service.classifyTrade(trade)).toBe(TradePattern.PANIC_SELL);
        });

        it('should classify WHALE_EXIT when selling at > 0.70', () => {
            const trade: TradeData = {
                amountUSD: 1000,
                isNewMarket: false,
                price: 0.85,
                side: 'SELL'
            };
            expect(service.classifyTrade(trade)).toBe(TradePattern.WHALE_EXIT);
        });
    });
});
