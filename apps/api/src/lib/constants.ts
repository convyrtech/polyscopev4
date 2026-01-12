/**
 * WhaleScope Constants
 * 
 * Centralized configuration values - no more magic numbers
 */

// ============================================================================
// VALIDATION PHASE SETTINGS
// ============================================================================

/** Maximum hours to market resolution for validation phase */
export const VALIDATION_MAX_RESOLUTION_HOURS = 48;

/** Minimum signals required for valid accuracy analysis */
export const MIN_SIGNALS_FOR_ANALYSIS = 20;

/** Minimum trades required to determine A/B test winner */
export const MIN_TRADES_FOR_WINNER = 10;

// ============================================================================
// SCORING THRESHOLDS
// ============================================================================

/** Score threshold for "high confidence" signals */
export const HIGH_SCORE_THRESHOLD = 80;

/** Minimum win rate for high-score bucket to pass validation */
export const MIN_WINRATE_HIGH_SCORE = 60;

// ============================================================================
// TRADING COSTS
// ============================================================================

/** Base gas cost per trade in USD (Polygon average) */
export const BASE_GAS_COST_USD = 0.10;

/** Min latency for order execution simulation (ms) - CONSERVATIVE: realistic blockchain + API delays */
export const MIN_LATENCY_MS = 10000;  // 10 seconds minimum

/** Max latency for order execution simulation (ms) - CONSERVATIVE */
export const MAX_LATENCY_MS = 25000;  // 25 seconds max

// ============================================================================
// PROFIT FACTOR THRESHOLDS
// ============================================================================

/** Profit factor for "strong winner" in A/B test */
export const STRONG_WINNER_PROFIT_FACTOR = 1.5;

/** Win rate required alongside profit factor for strong winner */
export const STRONG_WINNER_WINRATE = 55;

/** Profit factor for "moderate winner" */
export const MODERATE_WINNER_PROFIT_FACTOR = 1.2;

// ============================================================================
// LIQUIDITY SERVICE
// ============================================================================

/** Order book cache TTL in milliseconds */
export const ORDERBOOK_CACHE_TTL_MS = 5000;

/** Order book fetch timeout in milliseconds */
export const ORDERBOOK_FETCH_TIMEOUT_MS = 3000;

// ============================================================================
// LOGGING
// ============================================================================

/** Sample rate for price update logs (1/N trades logged) */
export const PRICE_LOG_SAMPLE_RATE = 0.02; // 1 in 50

// ============================================================================
// BETTING / POSITION SIZING
// ============================================================================

/** Minimum bet size in USD */
export const MIN_BET_SIZE_USD = 5;

/** Default bet size if not specified in config */
export const DEFAULT_BET_SIZE_USD = 100;

/** Kelly criterion max bet as % of balance (5% = conservative) */
export const KELLY_MAX_PERCENT = 0.05;

/** Score at which multiplier = 1.0 (baseline) */
export const SCORE_BASELINE = 70;

/** Minimum multiplier for low-score signals */
export const MIN_SCORE_MULTIPLIER = 0.5;

/** Maximum multiplier for high-score signals */
export const MAX_SCORE_MULTIPLIER = 1.5;

// ============================================================================
// MARKET FILTERS
// ============================================================================

/** Keywords to identify crypto markets */
export const CRYPTO_KEYWORDS = ['btc', 'eth', 'sol', 'bitcoin', 'ethereum', 'crypto', 'solana', 'xrp'];

/** Keywords to identify politics markets */
export const POLITICS_KEYWORDS = ['trump', 'biden', 'election', 'congress', 'senate', 'president', 'democrat', 'republican'];

/** 
 * Keywords to identify sports markets (KILL SWITCH - no alpha in sports)
 * Centralized list - used by AnalysisService and Ingestor
 */
export const SPORTS_KEYWORDS = [
    'nba', 'nfl', 'mlb', 'nhl', 'ufc', 'premier-league', 'la-liga',
    'champions-league', 'world-cup', 'super-bowl', 'boxing', 'mma',
    'tennis', 'golf', 'formula-1', 'f1', 'cricket', 'rugby',
    'basketball', 'football', 'soccer', 'hockey', 'baseball',
    'playoffs', 'finals', 'championship', 'match', 'game-'
];

/**
 * BANNED MARKET PATTERNS - markets we CANNOT profitably trade
 * 15-min binary options = gambling, not trading
 * Price moves too fast, no time to react after whale detection
 */
export const BANNED_MARKET_PATTERNS = [
    'updown-15m',      // 15-minute binary BTC/ETH
    'updown-5m',       // 5-minute binary (if exists)
    'updown-1h',       // 1-hour binary - still too fast
    '-15m-',           // Any 15-min market
    '-5m-',            // Any 5-min market  
    'binary-',         // Explicit binary markets
];

// ============================================================================
// ANALYSIS SERVICE - Whale Classification
// ============================================================================

/** Minimum trade amount for analysis (below this = noise) */
export const MIN_TRADE_AMOUNT_USD = 500;

/** Win rate threshold for "Sniper" classification */
export const SNIPER_WINRATE_THRESHOLD = 65;

/** Win rate below this = "Loser/Hamster" */
export const LOSER_WINRATE_THRESHOLD = 40;

/** PnL threshold for "Shark" classification */
export const SHARK_PNL_THRESHOLD = 10000;

/** Volume threshold for fresh wallet with impact */
export const FRESH_WALLET_VOLUME_THRESHOLD = 2000;

/** Minimum volume to check for wash trading */
export const WASH_TRADER_MIN_VOLUME = 100000;

/** ROI below this with high volume = wash trader (2% = 0.02) */
export const WASH_TRADER_MAX_ROI = 0.02;

/** Minimum trades to flag as spammer */
export const SPAMMER_MIN_TRADES = 50;

// ============================================================================
// ANALYSIS SERVICE - Volume Score Thresholds
// ============================================================================

export const VOLUME_SCORE_THRESHOLDS = [
    { minUSD: 50000, score: 100 },
    { minUSD: 20000, score: 90 },
    { minUSD: 10000, score: 80 },
    { minUSD: 5000, score: 70 },
    { minUSD: 2000, score: 60 },
    { minUSD: 1000, score: 50 },
    { minUSD: 0, score: 40 }  // Base
];

// ============================================================================
// ANALYSIS SERVICE - Alpha Matrix Weights
// ============================================================================

/** Weights for PROVEN whale type (has track record) */
export const PROVEN_WEIGHTS = { performance: 0.60, insider: 0.25, volume: 0.15 };

/** Weights for FRESH whale type (new wallet) */
export const FRESH_WEIGHTS = { performance: 0.00, insider: 0.50, volume: 0.50 };

/** Weights for UNKNOWN whale type */
export const UNKNOWN_WEIGHTS = { performance: 0.30, insider: 0.35, volume: 0.35 };

// ============================================================================
// ANALYSIS SERVICE - Trade Pattern Thresholds
// ============================================================================

/** Price threshold for FOMO chase pattern (buying high) */
export const FOMO_PRICE_THRESHOLD = 0.90;

/** Price threshold for smart entry pattern (buying low) */
export const SMART_ENTRY_THRESHOLD = 0.10;

/** Price threshold for panic sell pattern */
export const PANIC_SELL_THRESHOLD = 0.30;

/** Price threshold for whale exit pattern */
export const WHALE_EXIT_THRESHOLD = 0.70;

// ============================================================================
// INGESTOR - Limits and Timeouts
// ============================================================================

/** Maximum processed trade IDs to keep in memory */
export const MAX_PROCESSED_IDS = 100000;

/** Maximum event map entries */
export const MAX_EVENT_MAP_SIZE = 1000;

/** Cleanup percentage when limits reached */
export const CLEANUP_PERCENT = 0.20;

/** WebSocket reconnect delay (ms) */
export const WS_RECONNECT_DELAY_MS = 5000;

/** WebSocket ping interval (ms) */
export const WS_PING_INTERVAL_MS = 20000;

/** HTTP polling interval (ms) */
export const HTTP_POLL_INTERVAL_MS = 200;

/** Discovery scan interval (ms) - 10 minutes */
export const DISCOVERY_INTERVAL_MS = 10 * 60 * 1000;

/** Maximum markets to subscribe via WebSocket */
export const WS_MAX_SUBSCRIPTIONS = 20;

/** Markets to fetch in discovery */
export const DISCOVERY_MARKET_LIMIT = 50;

/** Target signals for backfill */
export const BACKFILL_TARGET_SIGNALS = 50;

// ============================================================================
// INGESTOR - Whale Tags by Volume
// ============================================================================

/** Volume threshold for LEVIATHAN tag */
export const LEVIATHAN_VOLUME_USD = 50000;

/** Volume threshold for SHARK tag */
export const SHARK_VOLUME_USD = 10000;

/** Volume threshold for DOLPHIN tag */
export const DOLPHIN_VOLUME_USD = 1000;

// ============================================================================
// KELLY / WIN PROBABILITY
// ============================================================================

/** Maximum edge we believe a whale signal provides */
export const MAX_EDGE_PERCENT = 0.20;

/** Maximum win probability cap */
export const MAX_WIN_PROBABILITY = 0.95;

// ============================================================================
// LIQUIDITY SERVICE - Fallback Slippage
// ============================================================================

// CONSERVATIVE SLIPPAGE - 3x higher than optimistic estimate
// Real-world: whale already moved price + our trade moves it more
export const FALLBACK_SLIPPAGE_TIERS = [
    { maxUSD: 500, basePercent: 2.0 },    // Was 0.5%
    { maxUSD: 2000, basePercent: 4.0 },   // Was 1.5%
    { maxUSD: 5000, basePercent: 6.0 },   // Was 3.0%
    { maxUSD: Infinity, basePercent: 10.0 } // Was 5.0%
];

/** Slippage randomness factor range */
export const SLIPPAGE_RANDOM_MIN = 0.7;
export const SLIPPAGE_RANDOM_MAX = 1.3;

/** Threshold for "liquid" market (slippage %) */
export const LIQUID_SLIPPAGE_THRESHOLD = 5;

// ============================================================================
// STRATEGY SERVICE - Trade Filters
// ============================================================================

/** Price floor - below this = lottery ticket, skip (Strategy Service) */
export const PRICE_FLOOR = 0.20;

/** Price floor soft - minimum for Paper Trading (can be bypassed by high score) */
export const PRICE_FLOOR_SOFT = 0.15;

/** Price ceiling - above this = low upside, skip. CONSERVATIVE: lowered from 0.85 */
export const PRICE_CEILING = 0.75;

/** Score threshold to bypass price floor filters */
export const HIGH_CONFIDENCE_SCORE_THRESHOLD = 80;

/** Minimum market volume for liquidity */
export const MIN_MARKET_VOLUME_USD = 10000;

/** Maximum days to expiry for trade */
export const MAX_DAYS_TO_EXPIRY = 7;

/** Radar score threshold for high confidence insider */
export const HIGH_RADAR_SCORE = 80;

/** Radar score threshold for moderate confidence */
export const MODERATE_RADAR_SCORE = 60;

/** Confidence level for high radar score */
export const HIGH_RADAR_CONFIDENCE = 0.95;

/** Confidence level for moderate radar score */
export const MODERATE_RADAR_CONFIDENCE = 0.75;

/** Minimum winrate for smart money whale */
export const SMART_MONEY_MIN_WINRATE = 55;

/** Minimum PnL for smart money whale */
export const SMART_MONEY_MIN_PNL = 1000;

// ============================================================================
// PAPER TRADING - Price Guards
// ============================================================================

/** Maximum price deviation from signal price to allow entry (5% = 0.05) */
export const MAX_PRICE_DEVIATION_PERCENT = 0.05;

/** Maximum entry price (cap to avoid 0.99+ entries) */
export const MAX_ENTRY_PRICE = 0.99;

/** Maximum price cap for TP targets (just below 1.0) */
export const MAX_TP_TARGET_PRICE = 0.99;

/** Minimum price floor for SL targets (just above 0) */
export const MIN_SL_TARGET_PRICE = 0.01;

/** Fallback exit slippage when no order book - CONSERVATIVE: raised to match entry tiers */
export const FALLBACK_EXIT_SLIPPAGE_PERCENT = 0.04;

// ============================================================================
// STRATEGY TUNING - Validation Ranges
// ============================================================================

/** Valid range for takeProfit config */
export const TAKE_PROFIT_RANGE = { min: 0.05, max: 2.0 };

/** Valid range for stopLoss config */
export const STOP_LOSS_RANGE = { min: 0.05, max: 1.0 };

/** Default budget for new strategies */
export const DEFAULT_STRATEGY_BUDGET = 1000;

// ============================================================================
// EXPERIMENTS
// ============================================================================

/** Default experiment duration (hours) */
export const DEFAULT_EXPERIMENT_DURATION_HOURS = 72;

/** Default target signals per experiment */
export const DEFAULT_EXPERIMENT_TARGET_SIGNALS = 20;

// ============================================================================
// TIME HELPERS (avoid magic math everywhere)
// ============================================================================

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_HOUR = 60 * 60 * 1000;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
