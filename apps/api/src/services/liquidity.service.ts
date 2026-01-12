/**
 * Liquidity Service
 * 
 * Fetches real order book data from Polymarket CLOB and calculates
 * realistic slippage based on actual liquidity depth.
 * 
 * This replaces the naive 1% fixed slippage with real market data.
 */

import { ENV } from '../lib/config';

interface OrderBookLevel {
    price: string;
    size: string;
}

interface OrderBook {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    market: string;
    asset_id: string;
    timestamp: string;
}

interface SlippageResult {
    slippagePercent: number;
    slippageCost: number;
    effectivePrice: number;
    liquidityDepthUSD: number;
    spreadPercent: number;
    isLiquid: boolean;
    source: 'ORDERBOOK' | 'FALLBACK';
}

// Cached order books (5 second TTL)
const orderBookCache = new Map<string, { data: OrderBook; timestamp: number }>();
const CACHE_TTL_MS = 5000;

// Polymarket CLOB API endpoint
const CLOB_API = process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com';

/**
 * Fetches order book from Polymarket CLOB API
 */
export async function fetchOrderBook(tokenId: string): Promise<OrderBook | null> {
    // Check cache first
    const cached = orderBookCache.get(tokenId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const response = await fetch(
            `${CLOB_API}/book?token_id=${tokenId}`,
            {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(3000)
            }
        );

        if (!response.ok) {
            console.warn(`[Liquidity] Failed to fetch order book for ${tokenId}: ${response.status}`);
            return null;
        }

        const data = await response.json() as OrderBook;
        orderBookCache.set(tokenId, { data, timestamp: Date.now() });
        return data;
    } catch (error) {
        console.error(`[Liquidity] Error fetching order book:`, error);
        return null;
    }
}

/**
 * Calculates realistic slippage for a BUY order based on order book depth
 * 
 * @param tokenId - Polymarket token ID (YES/NO outcome), null triggers fallback
 * @param side - 'BUY' or 'SELL'
 * @param amountUSD - Trade size in USD
 * @param currentPrice - Current mid price (0-1)
 */
export async function calculateSlippage(
    tokenId: string | null,
    side: 'BUY' | 'SELL',
    amountUSD: number,
    currentPrice: number
): Promise<SlippageResult> {
    // ================================================================
    // GUARD CLAUSE: Prevent division by zero and NaN propagation
    // ================================================================
    if (!currentPrice || currentPrice <= 0 || !Number.isFinite(currentPrice)) {
        console.warn(`⚠️ [Liquidity] Invalid currentPrice: ${currentPrice}, returning safe fallback`);
        return {
            slippagePercent: 0,
            slippageCost: 0,
            effectivePrice: 0.5, // Default mid-price for prediction market
            liquidityDepthUSD: 0,
            spreadPercent: 0,
            isLiquid: false,
            source: 'FALLBACK'
        };
    }

    // If no tokenId, use fallback immediately
    if (!tokenId) {
        return calculateFallbackSlippage(amountUSD, currentPrice, side);
    }

    const orderBook = await fetchOrderBook(tokenId);

    // Fallback if no order book available
    if (!orderBook || (orderBook.asks.length === 0 && orderBook.bids.length === 0)) {
        return calculateFallbackSlippage(amountUSD, currentPrice, side);
    }

    // For BUY: we consume ASKs (selling side)
    // For SELL: we consume BIDs (buying side)
    const levels = side === 'BUY'
        ? orderBook.asks.map(l => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
        : orderBook.bids.map(l => ({ price: parseFloat(l.price), size: parseFloat(l.size) })).reverse();

    if (levels.length === 0) {
        return calculateFallbackSlippage(amountUSD, currentPrice, side);
    }

    // Calculate spread
    const bestBid = orderBook.bids.length > 0 ? parseFloat(orderBook.bids[0].price) : 0;
    const bestAsk = orderBook.asks.length > 0 ? parseFloat(orderBook.asks[0].price) : 1;
    const spreadPercent = ((bestAsk - bestBid) / currentPrice) * 100;

    // Walk through order book to fill our order
    let remainingUSD = amountUSD;
    let totalCost = 0;
    let totalShares = 0;

    for (const level of levels) {
        const levelValueUSD = level.price * level.size;

        if (levelValueUSD >= remainingUSD) {
            // This level can fill the rest
            const sharesToBuy = remainingUSD / level.price;
            totalCost += remainingUSD;
            totalShares += sharesToBuy;
            remainingUSD = 0;
            break;
        } else {
            // Consume entire level
            totalCost += levelValueUSD;
            totalShares += level.size;
            remainingUSD -= levelValueUSD;
        }
    }

    // If we couldn't fill the order, add penalty
    if (remainingUSD > 0) {
        const lastPrice = levels[levels.length - 1]?.price || currentPrice * 1.1;
        const penaltyPrice = lastPrice * 1.05; // 5% worse than worst level
        totalCost += remainingUSD;
        totalShares += remainingUSD / penaltyPrice;
    }

    // Calculate effective price and slippage
    const effectivePrice = totalShares > 0 ? totalCost / totalShares : currentPrice;
    const idealCost = currentPrice * totalShares;
    const slippageCost = Math.abs(totalCost - idealCost);
    const slippagePercent = idealCost > 0 ? (slippageCost / idealCost) * 100 : 0;

    // Calculate total liquidity depth in USD
    const liquidityDepthUSD = levels.reduce(
        (sum, l) => sum + l.price * l.size,
        0
    );

    // Consider liquid if we can fill 90%+ without massive slippage
    const isLiquid = remainingUSD < amountUSD * 0.1 && slippagePercent < 5;

    return {
        slippagePercent,
        slippageCost,
        effectivePrice,
        liquidityDepthUSD,
        spreadPercent,
        isLiquid,
        source: 'ORDERBOOK'
    };
}

// Import constants for fallback slippage
import {
    FALLBACK_SLIPPAGE_TIERS,
    SLIPPAGE_RANDOM_MIN,
    SLIPPAGE_RANDOM_MAX,
    BASE_GAS_COST_USD
} from '../lib/constants';

/**
 * Fallback slippage calculation when order book is unavailable
 * Uses a more realistic model based on trade size
 */
function calculateFallbackSlippage(
    amountUSD: number,
    currentPrice: number,
    side: 'BUY' | 'SELL'
): SlippageResult {
    // Find appropriate tier based on amount
    let baseSlippage = FALLBACK_SLIPPAGE_TIERS[FALLBACK_SLIPPAGE_TIERS.length - 1].basePercent;
    for (let i = 0; i < FALLBACK_SLIPPAGE_TIERS.length; i++) {
        if (amountUSD <= FALLBACK_SLIPPAGE_TIERS[i].maxUSD) {
            if (i === 0) {
                baseSlippage = FALLBACK_SLIPPAGE_TIERS[i].basePercent;
            } else {
                // Linear interpolation between tiers
                const prevTier = FALLBACK_SLIPPAGE_TIERS[i - 1];
                const currTier = FALLBACK_SLIPPAGE_TIERS[i];
                const ratio = (amountUSD - prevTier.maxUSD) / (currTier.maxUSD - prevTier.maxUSD);
                baseSlippage = prevTier.basePercent + ratio * (currTier.basePercent - prevTier.basePercent);
            }
            break;
        }
    }

    // Add randomness
    const randomFactor = SLIPPAGE_RANDOM_MIN + Math.random() * (SLIPPAGE_RANDOM_MAX - SLIPPAGE_RANDOM_MIN);
    const slippagePercent = baseSlippage * randomFactor;

    const slippageCost = amountUSD * (slippagePercent / 100);
    const effectivePrice = side === 'BUY'
        ? currentPrice * (1 + slippagePercent / 100)
        : currentPrice * (1 - slippagePercent / 100);

    return {
        slippagePercent,
        slippageCost,
        effectivePrice,
        liquidityDepthUSD: 0,
        spreadPercent: 1.0, // Assume 1% spread
        isLiquid: amountUSD <= FALLBACK_SLIPPAGE_TIERS[1].maxUSD, // Liquid if < 2nd tier
        source: 'FALLBACK'
    };
}

/**
 * Estimates gas cost for a trade on Polygon
 * Currently uses a fixed estimate, could be enhanced with real gas oracle
 */
export function estimateGasCost(): number {
    return BASE_GAS_COST_USD;
}

/**
 * Full cost calculation for a paper trade
 */
export async function calculateTradeCosts(
    tokenId: string | null,
    side: 'BUY' | 'SELL',
    amountUSD: number,
    currentPrice: number
): Promise<{
    entrySlippage: SlippageResult;
    gasCost: number;
    totalCosts: number;
    effectiveEntry: number;
}> {
    const entrySlippage = await calculateSlippage(tokenId, side, amountUSD, currentPrice);
    const gasCost = estimateGasCost();

    return {
        entrySlippage,
        gasCost,
        totalCosts: entrySlippage.slippageCost + gasCost,
        effectiveEntry: entrySlippage.effectivePrice
    };
}

/**
 * Calculate exit costs (slippage only, gas handled separately)
 */
export async function calculateExitCosts(
    tokenId: string | null,
    shares: number,
    currentPrice: number
): Promise<SlippageResult> {
    const amountUSD = shares * currentPrice;
    return calculateSlippage(tokenId, 'SELL', amountUSD, currentPrice);
}

/**
 * Get best ask price from order book
 * Returns null if order book is unavailable or empty
 */
export async function getBestAsk(tokenId: string): Promise<number | null> {
    if (!tokenId) return null;

    const orderBook = await fetchOrderBook(tokenId);

    if (!orderBook || orderBook.asks.length === 0) {
        return null;
    }

    // Best ask is the lowest sell price
    const bestAsk = parseFloat(orderBook.asks[0].price);
    return isNaN(bestAsk) ? null : bestAsk;
}

/**
 * Get best bid price from order book
 * Returns null if order book is unavailable or empty
 */
export async function getBestBid(tokenId: string): Promise<number | null> {
    if (!tokenId) return null;

    const orderBook = await fetchOrderBook(tokenId);

    if (!orderBook || orderBook.bids.length === 0) {
        return null;
    }

    // Best bid is the highest buy price
    const bestBid = parseFloat(orderBook.bids[0].price);
    return isNaN(bestBid) ? null : bestBid;
}

// Export for testing
export { calculateFallbackSlippage };
