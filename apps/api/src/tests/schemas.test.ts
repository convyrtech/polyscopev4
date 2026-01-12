import { describe, it, expect } from 'vitest';
import {
    ClosedPositionSchema,
    ClosedPositionsResponseSchema,
    LeaderboardEntrySchema,
    GammaTradeSchema,
    GammaMarketSchema,
    DataApiTradeSchema,
    parseApiResponse,
    parseApiResponseOrThrow
} from '../lib/schemas';

describe('ClosedPositionSchema', () => {
    it('should parse valid closed position', () => {
        const validData = {
            conditionId: '0x123abc',
            title: 'Will Trump win 2024?',
            slug: 'will-trump-win-2024',
            outcome: 'Yes',
            avgPrice: 0.65,
            totalBought: 1000,
            realizedPnl: 350,
            curPrice: 1.0,
            timestamp: '2024-01-15T10:30:00Z'
        };

        const result = ClosedPositionSchema.safeParse(validData);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.conditionId).toBe('0x123abc');
            expect(result.data.realizedPnl).toBe(350);
        }
    });

    it('should use defaults for missing optional fields', () => {
        const minimalData = {
            conditionId: '0x123abc'
        };

        const result = ClosedPositionSchema.safeParse(minimalData);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.title).toBe('');
            expect(result.data.avgPrice).toBe(0);
            expect(result.data.totalBought).toBe(0);
        }
    });

    it('should fail without conditionId', () => {
        const invalidData = {
            title: 'Test Market'
        };

        const result = ClosedPositionSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });
});

describe('ClosedPositionsResponseSchema', () => {
    it('should parse array of positions', () => {
        const data = [
            { conditionId: '0x1', realizedPnl: 100 },
            { conditionId: '0x2', realizedPnl: -50 }
        ];

        const result = ClosedPositionsResponseSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toHaveLength(2);
            expect(result.data[0].realizedPnl).toBe(100);
        }
    });

    it('should parse empty array', () => {
        const result = ClosedPositionsResponseSchema.safeParse([]);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toHaveLength(0);
        }
    });
});

describe('LeaderboardEntrySchema', () => {
    it('should parse valid leaderboard entry', () => {
        const data = {
            rank: 1,
            proxyWallet: '0xabc123',
            userName: 'TopTrader',
            pnl: 50000,
            vol: 200000,
            profileImage: 'https://example.com/avatar.png'
        };

        const result = LeaderboardEntrySchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.rank).toBe(1);
            expect(result.data.pnl).toBe(50000);
        }
    });

    it('should require rank and proxyWallet', () => {
        const missingRank = { proxyWallet: '0xabc' };
        const missingWallet = { rank: 1 };

        expect(LeaderboardEntrySchema.safeParse(missingRank).success).toBe(false);
        expect(LeaderboardEntrySchema.safeParse(missingWallet).success).toBe(false);
    });
});

describe('GammaTradeSchema', () => {
    it('should transform string numbers to actual numbers', () => {
        const rawTrade = {
            id: 'trade123',
            taker_order_id: 'order456',
            market: '0xmarket',
            asset_id: '0xasset',
            side: 'BUY',
            size: '1500.50',  // String from API
            price: '0.65',   // String from API
            timestamp: 1704067200,
            transaction_hash: '0xtxhash'
        };

        const result = GammaTradeSchema.safeParse(rawTrade);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.size).toBe(1500.50);
            expect(result.data.price).toBe(0.65);
            expect(typeof result.data.size).toBe('number');
        }
    });

    it('should only allow BUY or SELL side', () => {
        const invalidSide = {
            id: 'trade123',
            taker_order_id: 'order456',
            market: '0xmarket',
            asset_id: '0xasset',
            side: 'HOLD', // Invalid
            size: '100',
            price: '0.5',
            timestamp: 1704067200,
            transaction_hash: '0xtxhash'
        };

        const result = GammaTradeSchema.safeParse(invalidSide);
        expect(result.success).toBe(false);
    });
});

describe('parseApiResponse', () => {
    it('should return parsed data on success', () => {
        const data = { conditionId: '0x123' };
        const result = parseApiResponse(ClosedPositionSchema, data, 'test');
        
        expect(result).not.toBeNull();
        expect(result?.conditionId).toBe('0x123');
    });

    it('should return null on validation failure', () => {
        const invalidData = { title: 'no conditionId' };
        const result = parseApiResponse(ClosedPositionSchema, invalidData, 'test');
        
        expect(result).toBeNull();
    });
});

describe('parseApiResponseOrThrow', () => {
    it('should return data on success', () => {
        const data = { conditionId: '0x123' };
        const result = parseApiResponseOrThrow(ClosedPositionSchema, data, 'test');
        
        expect(result.conditionId).toBe('0x123');
    });

    it('should throw on validation failure', () => {
        const invalidData = { title: 'no conditionId' };
        
        expect(() => parseApiResponseOrThrow(ClosedPositionSchema, invalidData, 'test'))
            .toThrow('Validation failed');
    });
});

describe('DataApiTradeSchema', () => {
    it('should parse valid trade from Polymarket Data API', () => {
        const rawTrade = {
            id: 'trade-abc123',
            asset_id: '0xasset123',
            price: '0.65',    // String from API
            size: '1000.50',  // String from API
            side: 'BUY',
            slug: 'will-trump-win',
            conditionId: '0xcondition',
            outcome: 'Yes',
            title: 'Will Trump Win?',
            maker_address: '0xmaker123',
            timestamp: '1704067200'
        };

        const result = DataApiTradeSchema.safeParse(rawTrade);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe('trade-abc123');
            expect(result.data.price).toBe(0.65);
            expect(result.data.size).toBe(1000.50);
            expect(typeof result.data.price).toBe('number');
            expect(typeof result.data.size).toBe('number');
            expect(result.data.slug).toBe('will-trump-win');
        }
    });

    it('should handle numeric price/size values', () => {
        const trade = {
            id: 'trade-123',
            price: 0.75,   // Already a number
            size: 500,     // Already a number
            side: 'SELL'
        };

        const result = DataApiTradeSchema.safeParse(trade);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.price).toBe(0.75);
            expect(result.data.size).toBe(500);
        }
    });

    it('should default side to BUY when missing', () => {
        const trade = {
            id: 'trade-123',
            price: '0.5',
            size: '100'
        };

        const result = DataApiTradeSchema.safeParse(trade);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.side).toBe('BUY');
        }
    });

    it('should allow optional id field (schema has .optional())', () => {
        const noId = {
            price: '0.5',
            size: '100'
        };

        const result = DataApiTradeSchema.safeParse(noId);
        // id is optional in schema, so this should pass
        expect(result.success).toBe(true);
    });

    it('should handle transactionHash as alternative id', () => {
        const trade = {
            id: 'trade-123',
            transactionHash: '0xhash456',
            match_id: 'match789',
            price: '0.5',
            size: '100'
        };

        const result = DataApiTradeSchema.safeParse(trade);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.transactionHash).toBe('0xhash456');
            expect(result.data.match_id).toBe('match789');
        }
    });

    it('should accept both asset_id and asset fields', () => {
        const withAssetId = {
            id: 'trade1',
            asset_id: '0xasset1',
            price: '0.5',
            size: '100'
        };
        const withAsset = {
            id: 'trade2',
            asset: '0xasset2',
            price: '0.5',
            size: '100'
        };

        const result1 = DataApiTradeSchema.safeParse(withAssetId);
        const result2 = DataApiTradeSchema.safeParse(withAsset);
        
        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        if (result1.success) expect(result1.data.asset_id).toBe('0xasset1');
        if (result2.success) expect(result2.data.asset).toBe('0xasset2');
    });
});

describe('GammaMarketSchema', () => {
    it('should parse valid market with tokens', () => {
        const market = {
            id: 'market-123',
            condition_id: '0xcondition',
            question: 'Will Bitcoin reach $100k?',
            slug: 'bitcoin-100k',
            tokens: [
                { token_id: '0xtoken1', outcome: 'Yes', price: 0.65 },
                { token_id: '0xtoken2', outcome: 'No', price: 0.35 }
            ],
            active: true,
            volume: '1000000'
        };

        const result = GammaMarketSchema.safeParse(market);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.slug).toBe('bitcoin-100k');
            expect(result.data.tokens).toHaveLength(2);
            expect(result.data.tokens[0].outcome).toBe('Yes');
        }
    });

    it('should parse market with clobTokenIds as string', () => {
        const market = {
            conditionId: '0xcondition',
            slug: 'test-market',
            clobTokenIds: '["0xtoken1", "0xtoken2"]',
            outcomes: '["Yes", "No"]'
        };

        const result = GammaMarketSchema.safeParse(market);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.clobTokenIds).toBe('["0xtoken1", "0xtoken2"]');
        }
    });

    it('should parse market with clobTokenIds as array', () => {
        const market = {
            conditionId: '0xcondition',
            slug: 'test-market',
            clobTokenIds: ['0xtoken1', '0xtoken2']
        };

        const result = GammaMarketSchema.safeParse(market);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.clobTokenIds).toEqual(['0xtoken1', '0xtoken2']);
        }
    });

    it('should use defaults for optional fields', () => {
        const minimalMarket = {};

        const result = GammaMarketSchema.safeParse(minimalMarket);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.question).toBe('');
            expect(result.data.slug).toBe('');
            expect(result.data.tokens).toEqual([]);
            expect(result.data.resolved).toBe(false);
            expect(result.data.active).toBe(true);
        }
    });

    it('should handle volume as string or number', () => {
        const withStringVolume = { slug: 'test', volume: '50000' };
        const withNumberVolume = { slug: 'test', volume: 50000 };

        const result1 = GammaMarketSchema.safeParse(withStringVolume);
        const result2 = GammaMarketSchema.safeParse(withNumberVolume);
        
        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
    });
});
