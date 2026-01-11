// ============================================================================
// API VALIDATION SCHEMAS - Runtime validation for external API responses
// ============================================================================

import { z } from 'zod';

// ============================================================================
// POLYMARKET DATA API SCHEMAS
// ============================================================================

/**
 * Closed position from Polymarket Data API
 * Endpoint: /v1/closed-positions
 */
export const ClosedPositionSchema = z.object({
    conditionId: z.string(),
    title: z.string().optional().default(''),
    slug: z.string().optional().default(''),
    outcome: z.string().optional().default(''),
    avgPrice: z.number().optional().default(0),
    totalBought: z.number().optional().default(0),
    realizedPnl: z.number().optional().default(0),
    curPrice: z.number().optional().default(0),
    timestamp: z.union([z.string(), z.number()]).optional().transform((v) => v?.toString() || ''),
});

export const ClosedPositionsResponseSchema = z.array(ClosedPositionSchema);

/**
 * Leaderboard entry from Polymarket Data API
 * Endpoint: /v1/leaderboard
 */
export const LeaderboardEntrySchema = z.object({
    rank: z.number(),
    proxyWallet: z.string(),
    userName: z.string().optional().default(''),
    pnl: z.number().optional().default(0),
    vol: z.number().optional().default(0),
    profileImage: z.string().optional(),
});

export const LeaderboardResponseSchema = z.array(LeaderboardEntrySchema);

// ============================================================================
// GAMMA API SCHEMAS (Polymarket CLOB)
// ============================================================================

/**
 * Trade from Gamma API
 * Endpoint: /data/trades
 */
export const GammaTradeSchema = z.object({
    id: z.string(),
    taker_order_id: z.string(),
    market: z.string(),
    asset_id: z.string(),
    side: z.enum(['BUY', 'SELL']),
    size: z.string().transform((v) => parseFloat(v) || 0),
    price: z.string().transform((v) => parseFloat(v) || 0),
    timestamp: z.number(),
    transaction_hash: z.string(),
    maker_address: z.string().optional(),
    trader_side: z.string().optional(),
    outcome: z.string().optional(),
});

export const GammaTradesResponseSchema = z.array(GammaTradeSchema);

/**
 * Trade from Polymarket Data API
 * Endpoint: data-api.polymarket.com/trades
 */
export const DataApiTradeSchema = z.object({
    id: z.string().optional(),
    transactionHash: z.string().optional(),
    match_id: z.string().optional(),
    asset_id: z.string().optional(),
    asset: z.string().optional(),
    price: z.union([z.string(), z.number()]).transform((v) => Number(v) || 0),
    size: z.union([z.string(), z.number()]).transform((v) => Number(v) || 0),
    side: z.string().optional().default('BUY'),
    slug: z.string().optional(),
    eventSlug: z.string().optional(),
    conditionId: z.string().optional(),
    outcome: z.string().optional(),
    title: z.string().optional(),
    maker_address: z.string().optional(),
    owner: z.string().optional(),
    proxyWallet: z.string().optional(),
    name: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
});

export const DataApiTradesResponseSchema = z.array(DataApiTradeSchema);

/**
 * Market from Gamma API
 * Endpoint: /markets/[conditionId]
 */
export const GammaMarketTokenSchema = z.object({
    token_id: z.string(),
    outcome: z.string(),
    price: z.number().optional(),
});

export const GammaMarketSchema = z.object({
    id: z.string().optional(),
    condition_id: z.string().optional(),
    conditionId: z.string().optional(),
    question: z.string().optional().default(''),
    slug: z.string().optional().default(''),
    tokens: z.array(GammaMarketTokenSchema).optional().default([]),
    clobTokenIds: z.union([z.string(), z.array(z.string())]).optional(),
    outcomes: z.union([z.string(), z.array(z.string())]).optional(),
    resolved: z.boolean().optional().default(false),
    active: z.boolean().optional().default(true),
    closed: z.boolean().optional().default(false),
    end_date_iso: z.string().optional(),
    winning_outcome: z.string().optional(),
    volume: z.union([z.string(), z.number()]).optional(),
    description: z.string().optional(),
});

// ============================================================================
// ALCHEMY API SCHEMAS (Polygon Blockchain)
// ============================================================================

/**
 * Asset transfer from Alchemy API
 * Endpoint: /getAssetTransfers
 */
export const AlchemyTransferSchema = z.object({
    from: z.string(),
    to: z.string().nullable(),
    value: z.number().nullable().optional(),
    asset: z.string().nullable().optional(),
    category: z.string(),
    hash: z.string(),
    blockNum: z.string(),
});

export const AlchemyTransfersResponseSchema = z.object({
    transfers: z.array(AlchemyTransferSchema),
    pageKey: z.string().optional(),
});

// ============================================================================
// TYPE EXPORTS (inferred from schemas)
// ============================================================================

export type ClosedPosition = z.infer<typeof ClosedPositionSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type GammaTrade = z.infer<typeof GammaTradeSchema>;
export type GammaMarket = z.infer<typeof GammaMarketSchema>;
export type GammaMarketToken = z.infer<typeof GammaMarketTokenSchema>;
export type AlchemyTransfer = z.infer<typeof AlchemyTransferSchema>;
export type DataApiTrade = z.infer<typeof DataApiTradeSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Parse and validate API response with detailed error logging
 */
export function parseApiResponse<T>(
    schema: z.ZodType<T>,
    data: unknown,
    label: string
): T | null {
    const result = schema.safeParse(data);
    
    if (!result.success) {
        console.error(`[${label}] Validation failed:`, result.error.format());
        return null;
    }
    
    return result.data;
}

/**
 * Parse API response, throwing on failure
 */
export function parseApiResponseOrThrow<T>(
    schema: z.ZodType<T>,
    data: unknown,
    label: string
): T {
    const result = schema.safeParse(data);
    
    if (!result.success) {
        const errorMsg = result.error.issues
            .map(i => `${i.path.join('.')}: ${i.message}`)
            .join(', ');
        throw new Error(`[${label}] Validation failed: ${errorMsg}`);
    }
    
    return result.data;
}
