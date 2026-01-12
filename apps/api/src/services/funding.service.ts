/**
 * FundingService - Source of Funds Detection via Alchemy API
 * 
 * Analyzes wallet funding history to detect:
 * - Tornado Cash / Mixer funded wallets (SUSPICIOUS_INSIDER)
 * - CEX-funded retail traders (RETAIL)
 * - Bridge users (BRIDGE)
 * - Unknown/fresh wallets (UNKNOWN)
 * 
 * Integration Points:
 * - Called from AnalysisService during scoring
 * - Updates Whale.fundingSource, fundingSourceTag, fundingAnalyzedAt
 */

import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from 'alchemy-sdk';
import { prisma } from '@whalescope/db';
import { KNOWN_ADDRESSES, lookupAddress, KnownAddress } from '../data/known-addresses';
import logger from '../lib/logger';
import { MS_PER_HOUR, MS_PER_DAY } from '../lib/constants';

// Lazy Alchemy initialization - allows dotenv to load first
let _alchemy: Alchemy | null = null;
let _alchemyInitialized = false;

function getAlchemy(): Alchemy | null {
    if (!_alchemyInitialized) {
        _alchemyInitialized = true;
        const apiKey = process.env.ALCHEMY_API_KEY;
        if (!apiKey) {
            logger.warn('[FundingService] ALCHEMY_API_KEY not set - funding analysis will be disabled');
        } else {
            _alchemy = new Alchemy({
                apiKey,
                network: Network.MATIC_MAINNET, // Polygon
            });
            logger.info('[FundingService] Alchemy SDK initialized');
        }
    }
    return _alchemy;
}

export interface FundingAnalysis {
    primarySource: string | null;      // Address of primary funding source
    tag: 'RETAIL' | 'SUSPICIOUS_INSIDER' | 'BRIDGE' | 'WHALE' | 'PROTOCOL' | 'UNKNOWN';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    scoreBoost: number;
    sourceName: string;
    totalFundingUSD?: number;
    analysisDetails: string;
}

export class FundingService {
    private static instance: FundingService;
    private analysisCache: Map<string, { result: FundingAnalysis; timestamp: number }> = new Map();
    private readonly CACHE_TTL = MS_PER_DAY; // 24 hours
    private readonly MAX_TRANSFERS_TO_ANALYZE = 100;
    private cleanupInterval: NodeJS.Timeout | null = null;

    private constructor() {
        // Auto-cleanup stale cache entries every hour
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let cleaned = 0;
            for (const [key, value] of this.analysisCache) {
                if (now - value.timestamp > this.CACHE_TTL) {
                    this.analysisCache.delete(key);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                logger.debug(`[Funding] Cleaned ${cleaned} stale cache entries`);
            }
        }, MS_PER_HOUR); // Every hour
    }

    static getInstance(): FundingService {
        if (!FundingService.instance) {
            FundingService.instance = new FundingService();
        }
        return FundingService.instance;
    }

    /**
     * Analyze funding sources for a wallet address
     * Returns cached result if available and fresh
     */
    async analyzeFunding(address: string): Promise<FundingAnalysis> {
        const normalizedAddress = address.toLowerCase();

        // Check in-memory cache first
        const cached = this.analysisCache.get(normalizedAddress);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            logger.debug(`[Funding] Cache hit for ${normalizedAddress.substring(0, 10)}...`);
            return cached.result;
        }

        // Check database cache
        try {
            const whale = await prisma.whale.findUnique({
                where: { address: normalizedAddress },
                select: { fundingSource: true, fundingSourceTag: true, fundingAnalyzedAt: true }
            });

            if (whale?.fundingAnalyzedAt) {
                const age = Date.now() - whale.fundingAnalyzedAt.getTime();
                if (age < this.CACHE_TTL) {
                    const result: FundingAnalysis = {
                        primarySource: whale.fundingSource,
                        tag: (whale.fundingSourceTag as FundingAnalysis['tag']) || 'UNKNOWN',
                        confidence: 'HIGH',
                        scoreBoost: this.getScoreBoostForTag(whale.fundingSourceTag),
                        sourceName: whale.fundingSource ? this.getSourceName(whale.fundingSource) : 'Unknown',
                        analysisDetails: 'Cached from database'
                    };
                    this.analysisCache.set(normalizedAddress, { result, timestamp: Date.now() });
                    return result;
                }
            }
        } catch (e) {
            logger.warn(`[Funding] DB cache lookup failed: ${e}`);
        }

        // Perform fresh analysis via Alchemy
        const result = await this.performAlchemyAnalysis(normalizedAddress);

        // Update cache
        this.analysisCache.set(normalizedAddress, { result, timestamp: Date.now() });

        // Persist to database (non-blocking)
        this.persistAnalysis(normalizedAddress, result).catch(e => {
            logger.warn(`[Funding] Failed to persist analysis: ${e}`);
        });

        return result;
    }

    /**
     * Perform the actual Alchemy API analysis
     */
    private async performAlchemyAnalysis(address: string): Promise<FundingAnalysis> {
        // Lazy init Alchemy
        const alchemy = getAlchemy();
        
        // If Alchemy is not configured, return unknown
        if (!alchemy) {
            return {
                primarySource: null,
                tag: 'UNKNOWN',
                confidence: 'LOW',
                scoreBoost: 0,
                sourceName: 'Analysis Disabled',
                analysisDetails: 'ALCHEMY_API_KEY not configured'
            };
        }

        try {
            logger.info(`[Funding] Analyzing ${address.substring(0, 10)}... via Alchemy`);

            // Get incoming transfers to this address
            const transfers = await alchemy.core.getAssetTransfers({
                toAddress: address,
                category: [
                    AssetTransfersCategory.EXTERNAL,
                    AssetTransfersCategory.INTERNAL,
                    AssetTransfersCategory.ERC20,
                ],
                maxCount: this.MAX_TRANSFERS_TO_ANALYZE,
                order: SortingOrder.DESCENDING, // Most recent first
                withMetadata: true,
            });

            if (!transfers.transfers || transfers.transfers.length === 0) {
                return {
                    primarySource: null,
                    tag: 'UNKNOWN',
                    confidence: 'LOW',
                    scoreBoost: 0,
                    sourceName: 'No transfers found',
                    analysisDetails: 'No incoming transfers detected'
                };
            }

            // Analyze funding sources
            const sourceCounts: Map<string, { count: number; value: number; info: KnownAddress | null }> = new Map();
            let totalValue = 0;

            for (const transfer of transfers.transfers) {
                const fromAddress = transfer.from?.toLowerCase();
                if (!fromAddress) continue;

                const value = transfer.value || 0;
                totalValue += value;

                const known = lookupAddress(fromAddress);
                const existing = sourceCounts.get(fromAddress) || { count: 0, value: 0, info: known };
                existing.count++;
                existing.value += value;
                sourceCounts.set(fromAddress, existing);
            }

            // Find the most significant known source
            let primarySource: string | null = null;
            let primaryInfo: KnownAddress | null = null;
            let highestPriority = -Infinity;

            // Priority order: SUSPICIOUS_INSIDER > BRIDGE > WHALE > PROTOCOL > RETAIL
            const priorityMap: Record<string, number> = {
                'SUSPICIOUS_INSIDER': 100,
                'WHALE': 50,
                'BRIDGE': 30,
                'PROTOCOL': 10,
                'RETAIL': -10,
            };

            for (const [source, data] of sourceCounts.entries()) {
                if (data.info) {
                    const priority = priorityMap[data.info.tag] || 0;
                    // Weight by both priority and value
                    const weightedPriority = priority + (data.value / totalValue) * 20;

                    if (weightedPriority > highestPriority) {
                        highestPriority = weightedPriority;
                        primarySource = source;
                        primaryInfo = data.info;
                    }
                }
            }

            // Determine result
            if (primaryInfo) {
                const sourceData = sourceCounts.get(primarySource!)!;
                const percentage = ((sourceData.value / totalValue) * 100).toFixed(1);

                logger.info(`[Funding] ${address.substring(0, 10)}... → ${primaryInfo.tag}: ${primaryInfo.name} (${percentage}%)`);

                return {
                    primarySource: primarySource,
                    tag: primaryInfo.tag,
                    confidence: primaryInfo.confidence,
                    scoreBoost: primaryInfo.scoreBoost,
                    sourceName: primaryInfo.name,
                    totalFundingUSD: totalValue,
                    analysisDetails: `${primaryInfo.name} (${percentage}% of ${transfers.transfers.length} transfers)`
                };
            }

            // No known sources found
            return {
                primarySource: null,
                tag: 'UNKNOWN',
                confidence: 'LOW',
                scoreBoost: 0,
                sourceName: 'Unknown sources',
                totalFundingUSD: totalValue,
                analysisDetails: `${transfers.transfers.length} transfers from unknown sources`
            };

        } catch (error: any) {
            logger.error(`[Funding] Alchemy API error: ${error.message}`);
            return {
                primarySource: null,
                tag: 'UNKNOWN',
                confidence: 'LOW',
                scoreBoost: 0,
                sourceName: 'Analysis failed',
                analysisDetails: `Error: ${error.message}`
            };
        }
    }

    /**
     * Persist analysis results to database
     */
    private async persistAnalysis(address: string, result: FundingAnalysis): Promise<void> {
        // Use upsert to handle cases where whale doesn't exist yet
        await prisma.whale.upsert({
            where: { address },
            update: {
                fundingSource: result.primarySource,
                fundingSourceTag: result.tag,
                fundingAnalyzedAt: new Date(),
            },
            create: {
                address,
                fundingSource: result.primarySource,
                fundingSourceTag: result.tag,
                fundingAnalyzedAt: new Date(),
            }
        });
        logger.debug(`[Funding] Persisted analysis for ${address.substring(0, 10)}...`);
    }

    /**
     * Get score boost for a tag
     */
    private getScoreBoostForTag(tag: string | null): number {
        const boosts: Record<string, number> = {
            'SUSPICIOUS_INSIDER': 40,
            'WHALE': 20,
            'BRIDGE': 10,
            'PROTOCOL': 0,
            'RETAIL': -10,
            'UNKNOWN': 0,
        };
        return boosts[tag || 'UNKNOWN'] || 0;
    }

    /**
     * Get human-readable name for a source address
     */
    private getSourceName(address: string): string {
        const known = lookupAddress(address);
        return known?.name || 'Unknown';
    }

    /**
     * Quick check if address has suspicious funding (for filtering)
     */
    async hasSuspiciousFunding(address: string): Promise<boolean> {
        const analysis = await this.analyzeFunding(address);
        return analysis.tag === 'SUSPICIOUS_INSIDER';
    }

    /**
     * Quick check if address is retail funded (for filtering)
     */
    async isRetailFunded(address: string): Promise<boolean> {
        const analysis = await this.analyzeFunding(address);
        return analysis.tag === 'RETAIL';
    }

    /**
     * Get score boost for an address (for AnalysisService integration)
     */
    async getScoreBoost(address: string): Promise<number> {
        const analysis = await this.analyzeFunding(address);
        return analysis.scoreBoost;
    }

    /**
     * Batch analyze multiple addresses (for efficiency)
     */
    async analyzeMultiple(addresses: string[]): Promise<Map<string, FundingAnalysis>> {
        const results = new Map<string, FundingAnalysis>();

        // Process in parallel with rate limiting (max 5 concurrent)
        const batchSize = 5;
        for (let i = 0; i < addresses.length; i += batchSize) {
            const batch = addresses.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(addr => this.analyzeFunding(addr).then(r => ({ addr, result: r })))
            );
            for (const { addr, result } of batchResults) {
                results.set(addr, result);
            }
        }

        return results;
    }

    /**
     * Clear cache for an address (for testing/updates)
     */
    clearCache(address?: string): void {
        if (address) {
            this.analysisCache.delete(address.toLowerCase());
        } else {
            this.analysisCache.clear();
        }
    }

    /**
     * Graceful shutdown - clear interval and cache
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.analysisCache.clear();
        logger.info('[FundingService] Destroyed and cleaned up');
    }
}

// Export singleton
export const fundingService = FundingService.getInstance();
