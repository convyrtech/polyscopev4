/**
 * WhaleScope Type Definitions
 * 
 * Centralized interfaces to replace `any` types across the codebase
 */

// ============================================================================
// SIGNAL TYPES
// ============================================================================

export interface SignalInput {
    id: string;
    marketSlug: string;
    outcome: string;
    price: number;
    amountUSD: number;
    aiScore: number;
    tokenId?: string | null;
    conditionId?: string;
    whaleAddress: string;
    side?: string;
    tags?: string;
    strategyName?: string | null;
    betAmount?: number | null;
    timestamp?: Date | string;  // Signal creation timestamp for latency tracking
}

// ============================================================================
// STRATEGY TYPES
// ============================================================================

export interface StrategyConfig {
    // Score Filters
    minScore?: number;
    maxScore?: number;

    // Price Filters
    minPrice?: number;
    maxPrice?: number;

    // Volume Filters
    minVol?: number;

    // Position Management
    takeProfit?: number;  // 0.5 = 50% of potential profit
    stopLoss?: number;    // 0.3 = 30% of entry price

    // Sizing
    betSize?: number;
    dynamicSizing?: boolean;

    // Whale Filters
    whales?: string[];

    // Market Filters
    marketFilter?: 'crypto' | 'politics';

    // Time Filters
    skipTimeFilter?: boolean;
}

// ============================================================================
// WHALE TYPES
// ============================================================================

export interface WhaleStats {
    address: string;
    pnl: number;
    winrate: number;
    volume?: number;
    score?: number;
    tags?: string;
    alias?: string | null;
    totalTrades?: number;
    lastActive?: Date;
}

export interface WhaleForStrategy {
    pnl: number;
    winrate: number;
    score?: number;
    tags?: string;
}

// ============================================================================
// TRADE TYPES
// ============================================================================

export interface MarketTradeInput {
    marketSlug?: string;
    outcome?: string;
    price: number | string;
    actorAddress?: string;
    side?: 'BUY' | 'SELL' | string;
    timestamp?: number | string;
}

// ============================================================================
// MARKET TYPES (from Gamma API)
// ============================================================================

export interface GammaMarketToken {
    token_id: string;
    outcome: string;
    winner?: boolean;
    price?: number;
}

export interface GammaMarketResponse {
    slug: string;
    question: string;
    conditionId: string;
    resolved?: boolean;
    resolution_price?: string;
    uma_resolution_result?: string;
    end_date_iso?: string;
    volume?: string | number;
    tokens?: GammaMarketToken[];
    outcomes?: string | string[];
    clobTokenIds?: string | string[];
}

// ============================================================================
// POSITION TYPES
// ============================================================================

export interface PaperPositionWithStrategy {
    id: string;
    strategyId: string;
    signalId: string | null;
    marketSlug: string;
    outcome: string;
    tokenId: string | null;
    entryPrice: number;
    amountUSD: number;
    shares: number | null;
    entrySlippage: number | null;
    gasCost: number | null;
    latencyMs: number | null;
    totalSlippage: number | null;
    status: string;
    exitPrice: number | null;
    exitReason: string | null;
    pnl: number | null;
    exitSlippage: number | null;
    exitValue: number | null;
    openedAt: Date;
    closedAt: Date | null;
    strategy: {
        id: string;
        name: string;
        config: unknown;
        currentBalance: number;
        status: string;
        initialBudget: number;
        createdAt: Date;
    };
}

// ============================================================================
// ORDER BOOK TYPES
// ============================================================================

export interface OrderBookLevel {
    price: string;
    size: string;
}

export interface OrderBook {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    market: string;
    asset_id: string;
    timestamp: string;
}

export interface SlippageResult {
    slippagePercent: number;
    slippageCost: number;
    effectivePrice: number;
    liquidityDepthUSD: number;
    spreadPercent: number;
    isLiquid: boolean;
    source: 'ORDERBOOK' | 'FALLBACK';
}

// ============================================================================
// ANALYSIS TYPES
// ============================================================================

export interface ReliableStats {
    closedTrades: number;
    winrate: number;
    realizedPnL: number;
    totalVolume: number;
    avgTradeSize: number;
    roi: number;
    isReliable: boolean;
}

export interface FundingAnalysisResult {
    primarySource: string | null;
    tag: 'RETAIL' | 'SUSPICIOUS_INSIDER' | 'BRIDGE' | 'WHALE' | 'PROTOCOL' | 'UNKNOWN';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    scoreBoost: number;
    sourceName: string;
    totalFundingUSD?: number;
    analysisDetails: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiError {
    code: string;
    message: string;
    details?: unknown;
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: ApiError;
}
