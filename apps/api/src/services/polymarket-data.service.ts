/**
 * PolymarketDataService
 * 
 * Fetches REAL trading data from Polymarket Data API
 * Uses ONLY closed-positions for reliable scoring (not unrealized PnL)
 * 
 * API Docs: https://docs.polymarket.com
 * Rate Limits:
 * - /v1/closed-positions: 150 req / 10s
 * - /positions: 150 req / 10s
 * - /trades: 200 req / 10s
 * - /v1/leaderboard: 200 req / 10s
 */

import logger from '../lib/logger';
import { withRetry } from '../lib/retry';
import { MS_PER_MINUTE } from '../lib/constants';
import {
    ClosedPositionsResponseSchema,
    LeaderboardResponseSchema,
    parseApiResponse,
    type ClosedPosition,
    type LeaderboardEntry
} from '../lib/schemas';

const BASE_URL = 'https://data-api.polymarket.com';


// Removed global cache/interval to prevent memory leaks

const CACHE_TTL = 5 * MS_PER_MINUTE; // 5 minutes

export interface ReliableStats {
    address: string;
    closedTrades: number;      // Number of resolved positions
    wins: number;              // Positions with positive realizedPnl
    losses: number;            // Positions with negative realizedPnl
    winrate: number;           // 0-100%
    realizedPnL: number;       // Sum of all realized profits/losses
    totalVolume: number;       // Sum of totalBought from closed positions
    avgTradeSize: number;      // Average position size
    roi: number;               // realizedPnL / totalVolume (for wash trading detection)
    lastTradeAt: string | null;
    isReliable: boolean;       // true if enough data for scoring
}

class PolymarketDataService {
    private static instance: PolymarketDataService;
    private statsCache: Map<string, { data: ReliableStats; timestamp: number }>;
    private cleanupInterval: NodeJS.Timeout;

    public static getInstance(): PolymarketDataService {
        if (!PolymarketDataService.instance) {
            PolymarketDataService.instance = new PolymarketDataService();
        }
        return PolymarketDataService.instance;
    }

    private constructor() {
        this.statsCache = new Map();
        logger.info('📊 [PolymarketData] Service Initialized');

        // Auto-cleanup stale cache entries every 5 minutes
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let cleaned = 0;
            for (const [key, value] of this.statsCache) {
                if (now - value.timestamp > CACHE_TTL) {
                    this.statsCache.delete(key);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                logger.debug(`[PolymarketData] Cleaned ${cleaned} stale cache entries`);
            }
        }, CACHE_TTL);
    }

    /**
     * Get RELIABLE stats from CLOSED positions only
     * This is the source of truth for scoring
     */
    public async getReliableStats(address: string): Promise<ReliableStats> {
        const normalizedAddress = address.toLowerCase();

        // Check cache first
        const cached = this.statsCache.get(normalizedAddress);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            logger.debug(`[PolymarketData] Cache hit for ${normalizedAddress.substring(0, 10)}...`);
            return cached.data;
        }

        try {
            logger.info(`[PolymarketData] Fetching closed-positions for ${normalizedAddress.substring(0, 10)}...`);

            // Fetch closed positions with retry
            const rawPositions = await withRetry(
                async () => {
                    const response = await fetch(
                        `${BASE_URL}/v1/closed-positions?user=${normalizedAddress}&limit=50&sortBy=TIMESTAMP`,
                        {
                            headers: { 'Accept': 'application/json' },
                            signal: AbortSignal.timeout(10000),
                        }
                    );

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    return response.json();
                },
                'getClosedPositions',
                { maxRetries: 2 }
            );

            // Validate response with Zod
            const positions = parseApiResponse(
                ClosedPositionsResponseSchema,
                rawPositions,
                'ClosedPositions'
            );

            if (!positions || positions.length === 0) {
                logger.debug(`[PolymarketData] No closed positions for ${normalizedAddress.substring(0, 10)}...`);
                return this.emptyStats(normalizedAddress);
            }

            // Calculate stats from REAL closed data
            const wins = positions.filter(p => p.realizedPnl > 0).length;
            const losses = positions.filter(p => p.realizedPnl < 0).length;
            const closedTrades = positions.length;
            const winrate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;

            const realizedPnL = positions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0);
            const totalVolume = positions.reduce((sum, p) => sum + (p.totalBought || 0), 0);
            const avgTradeSize = closedTrades > 0 ? totalVolume / closedTrades : 0;
            const roi = totalVolume > 0 ? realizedPnL / totalVolume : 0;

            // Find most recent trade
            const lastTradeAt = positions.length > 0 ? positions[0].timestamp : null;

            const stats: ReliableStats = {
                address: normalizedAddress,
                closedTrades,
                wins,
                losses,
                winrate,
                realizedPnL,
                totalVolume,
                avgTradeSize,
                roi,
                lastTradeAt,
                isReliable: closedTrades >= 3, // Need at least 3 closed positions for reliable scoring
            };

            // Cache result
            this.statsCache.set(normalizedAddress, { data: stats, timestamp: Date.now() });

            logger.info(`[PolymarketData] ${normalizedAddress.substring(0, 10)}... | Trades=${closedTrades} WR=${winrate.toFixed(1)}% PnL=$${realizedPnL.toFixed(2)}`);

            return stats;

        } catch (error: any) {
            logger.error(`[PolymarketData] Error fetching stats: ${error.message}`);
            return this.emptyStats(normalizedAddress);
        }
    }

    /**
     * Get top traders from Polymarket leaderboard
     */
    public async getLeaderboard(
        period: 'DAY' | 'WEEK' | 'MONTH' | 'ALL' = 'MONTH',
        orderBy: 'PNL' | 'VOL' = 'PNL',
        limit: number = 50
    ): Promise<LeaderboardEntry[]> {
        try {
            const rawData = await withRetry(
                async () => {
                    const response = await fetch(
                        `${BASE_URL}/v1/leaderboard?timePeriod=${period}&orderBy=${orderBy}&limit=${limit}`,
                        {
                            headers: { 'Accept': 'application/json' },
                            signal: AbortSignal.timeout(10000),
                        }
                    );

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    return response.json();
                },
                'getLeaderboard',
                { maxRetries: 2 }
            );

            // Validate response
            const data = parseApiResponse(LeaderboardResponseSchema, rawData, 'Leaderboard');
            return data || [];

        } catch (error: any) {
            logger.error(`[PolymarketData] Leaderboard error: ${error.message}`);
            return [];
        }
    }

    /**
     * Clear cache for an address (call after whale makes new trade)
     */
    public clearCache(address: string): void {
        this.statsCache.delete(address.toLowerCase());
    }

    /**
     * Clear entire cache
     */
    public clearAllCache(): void {
        this.statsCache.clear();
    }

    private emptyStats(address: string): ReliableStats {
        return {
            address,
            closedTrades: 0,
            wins: 0,
            losses: 0,
            winrate: 0,
            realizedPnL: 0,
            totalVolume: 0,
            avgTradeSize: 0,
            roi: 0,
            lastTradeAt: null,
            isReliable: false,
        };
    }
}

export const polymarketDataService = PolymarketDataService.getInstance();
