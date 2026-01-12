/**
 * Application Configuration
 * Centralizes all magic numbers and configuration values
 */

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================
export const ENV = {
    DATABASE_URL: process.env.DATABASE_URL!,
    ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
    PAPER_BANKROLL: Number(process.env.PAPER_BANKROLL) || 10000,
    PORT: Number(process.env.PORT) || 3001,
    NODE_ENV: process.env.NODE_ENV || 'development',
    API_ORIGIN: process.env.API_ORIGIN,
} as const;

// ============================================================================
// INGESTOR CONFIGURATION
// ============================================================================
export const INGESTOR_CONFIG = {
    // Memory limits
    MAX_PROCESSED_IDS: 100000,
    MAX_EVENT_MAP_SIZE: 1000,
    MAX_MARKET_CACHE_SIZE: 5000,
    
    // Trade filtering (early exit optimization)
    MIN_TRADE_AMOUNT_USD: 500, // Skip trades below this - saves API calls
    MIN_SIGNAL_TRADE_AMOUNT: 100, // Minimum to even record in DB (discovery purposes)
    
    // Timing (ms)
    WS_PING_INTERVAL: 20000,
    POLLING_INTERVAL: 125, // 8 ticks/s × 2 batch = 16 req/s (80% of /trades 20 req/s limit)
    AUTO_DISCOVERY_INTERVAL: 10 * 60 * 1000, // 10 minutes
    WS_RECONNECT_DELAY: 5000,
    
    // Batch sizes
    POLLING_BATCH_SIZE: 2,
    WS_SUBSCRIBE_LIMIT: 20,
    BACKFILL_LIMIT: 100,
    BACKFILL_ASSETS_MAX: 2,
    DISCOVERY_MARKET_LIMIT: 50, // Top N markets to scan in auto-discovery
    FETCH_TRADES_LIMIT: 10, // Trades per asset poll
    
    // Thresholds
    MIN_BACKFILL_SIGNALS: 50,
    
    // Retry config
    MAX_RETRIES: 2,
    BASE_DELAY_MS: 500,
    
    // URLs
    WS_URL: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    GAMMA_URL: 'https://gamma-api.polymarket.com/markets',
    GAMMA_EVENTS_URL: 'https://gamma-api.polymarket.com/events',
    TRADE_API_URL: 'https://data-api.polymarket.com/trades',
} as const;

// ============================================================================
// RATE LIMITING
// ============================================================================
export const RATE_LIMIT_CONFIG = {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 100, // 100 requests per minute per IP
    CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
} as const;

// ============================================================================
// CACHING
// ============================================================================
export const CACHE_CONFIG = {
    FUNDING_TTL: 24 * 60 * 60 * 1000, // 24 hours
    STATS_TTL: 5 * 60 * 1000, // 5 minutes
    CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
} as const;

// ============================================================================
// WHALE TIERS
// ============================================================================
export const WHALE_TIERS = {
    LEVIATHAN: { minVolume: 50000, tag: 'LEVIATHAN', alias: 'Unknown Leviathan' },
    SHARK: { minVolume: 10000, tag: 'SHARK', alias: 'Unknown Shark' },
    DOLPHIN: { minVolume: 1000, tag: 'DOLPHIN', alias: null },
} as const;

// ============================================================================
// RISK MANAGEMENT (Kelly Criterion)
// ============================================================================
export const RISK_CONFIG = {
    MAX_CAP_PERCENT: 0.05, // 5% max single bet
    KELLY_FRACTION: 0.25, // Quarter Kelly
    CATEGORY_MULTIPLIERS: {
        POLITICS: 2.0,
        CRYPTO: 1.5,
        DEFAULT: 1.0,
    },
} as const;

// ============================================================================
// PAPER TRADING
// ============================================================================
export const PAPER_TRADING_CONFIG = {
    LATENCY_SIMULATION_MS: 500,
    SLIPPAGE_PERCENT: 0.5,
} as const;

// ============================================================================
// RESOLUTION
// ============================================================================
export const RESOLUTION_CONFIG = {
    INTERVAL_MS: 10 * 60 * 1000, // 10 minutes
    STALE_THRESHOLD_DAYS: 7,
} as const;

// ============================================================================
// API ROUTES
// ============================================================================
export const ROUTES_CONFIG = {
    DEFAULT_POSITIONS_LIMIT: 100,
    DEFAULT_SIGNALS_LIMIT: 100,
    MAX_SIGNALS_LIMIT: 500,
} as const;

// ============================================================================
// API
// ============================================================================
export const API_CONFIG = {
    CORS_ORIGINS: [
        'https://polymarket.com',
        'https://www.polymarket.com',
        'https://api.whalescope.io',
    ],
    SLUG_MAX_LENGTH: 200,
    ADDRESS_LENGTH: 42, // 0x + 40 hex chars
} as const;
