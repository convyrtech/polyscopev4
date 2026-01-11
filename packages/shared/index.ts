export const WORKSPACE_NAME = "WhaleScope";

// ============================================================================
// SHARED THRESHOLDS - Single Source of Truth
// ============================================================================

export const THRESHOLDS = {
    // Winrate thresholds (0-100 scale)
    SNIPER_WINRATE: 65,      // 65%+ = proven winner
    LOSER_WINRATE: 40,       // <40% = hamster kill switch
    
    // PnL thresholds
    SHARK_PNL: 10000,        // $10k+ realized PnL = shark
    
    // Trade thresholds
    MIN_TRADE_AMOUNT: 500,   // Minimum USD to evaluate
    MIN_TRADES_FOR_EVAL: 3,  // Min closed trades for reliable scoring
    FRESH_WALLET_MAX_TRADES: 5,
    
    // Anti-bot detection
    WASH_TRADER_MIN_VOLUME: 50000,  // $50k+ volume
    WASH_TRADER_MAX_ROI: 0.02,      // < 2% ROI = suspicious
    SPAMMER_MIN_TRADES: 50,         // 50+ trades
    SPAMMER_MAX_AVG_BET: 20,        // < $20 avg = dust bot
} as const;

// ============================================================================
// API URLs - Can be overridden by environment variables
// ============================================================================

export const API_URLS = {
    POLYMARKET_DATA: process.env.POLYMARKET_DATA_API || 'https://data-api.polymarket.com',
    POLYMARKET_GAMMA: process.env.POLYMARKET_GAMMA_API || 'https://gamma-api.polymarket.com',
    POLYMARKET_CLOB: process.env.POLYMARKET_CLOB_API || 'https://clob.polymarket.com',
} as const;

// ============================================================================
// SPORTS KEYWORDS - For filtering non-political markets
// ============================================================================

export const SPORTS_KEYWORDS = [
    // US Sports
    'nba', 'nfl', 'nhl', 'mlb', 'mls', 'ncaa', 'college',
    // Tennis
    'tennis', 'atp', 'wta', 'wimbledon', 'us-open', 'australian-open', 'french-open',
    // Football/Soccer
    'soccer', 'football', 'premier-league', 'bundesliga', 'serie-a', 'la-liga', 
    'champions-league', 'europa-league', 'world-cup', 'euro-', 'copa',
    'libertadores',
    // Combat
    'ufc', 'mma', 'boxing', 'bellator',
    // Cricket
    'cricket', 'ipl', 'test-match',
    // Racing
    'f1', 'formula', 'nascar', 'motogp', 'indycar',
    // Golf
    'golf', 'pga', 'masters', 'ryder-cup',
    // Other sports
    'hockey', 'baseball', 'basketball', 'rugby', 'six-nations',
    'olympics', 'olympic',
    'esports', 'cs2', 'dota', 'lol', 'valorant',
    'cycling', 'tour-de-france', 'giro',
    'afl', 'nrl',
    // Generic patterns
    'game-', '-game', 'match', 'vs-', '-vs', '-v-'
] as const;
