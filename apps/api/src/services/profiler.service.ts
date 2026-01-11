import { prisma } from '@whalescope/db';
import logger from '../lib/logger';

// ============================================================================
// PROFILER CONSTANTS (Unified thresholds)
// ============================================================================
const MIN_TRADES_FOR_CLASSIFICATION = 5;
const SHARK_PNL_THRESHOLD = 10000;
const SNIPER_WINRATE_THRESHOLD = 70; // 70% for profiler (stricter than analysis)
const HAMSTER_WINRATE_THRESHOLD = 30;   // <30% winrate

export interface ProfileResult {
    address: string;
    totalTrades: number;
    wins: number;
    losses: number;
    winrate: number;
    totalPnL: number;
    newTags: string[];
}

export class ProfilerService {
    private static instance: ProfilerService;

    public static getInstance(): ProfilerService {
        if (!ProfilerService.instance) {
            ProfilerService.instance = new ProfilerService();
        }
        return ProfilerService.instance;
    }

    private constructor() {
        console.log('🔬 [Profiler] Service Initialized.');
    }

    /**
     * Analyze a wallet's trading history and update their profile tags.
     * Should be called after market resolution when we have confirmed outcomes.
     */
    public async updateProfile(address: string): Promise<ProfileResult | null> {
        try {
            // 1. Query all resolved signals for this wallet
            const signals = await prisma.signal.findMany({
                where: {
                    whaleAddress: address,
                    status: { in: ['WON', 'LOST'] }
                },
                select: {
                    status: true,
                    amountUSD: true,
                    price: true,
                    roi: true
                }
            });

            if (signals.length === 0) {
                logger.debug(`[Profiler] No resolved trades for ${address.slice(0, 10)}...`);
                return null;
            }

            // 2. Calculate Statistics
            const wins = signals.filter(s => s.status === 'WON').length;
            const losses = signals.filter(s => s.status === 'LOST').length;
            const totalTrades = wins + losses;
            const winrate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

            // Calculate Total PnL
            // PnL = Sum of (amountUSD * roi / 100) for each trade
            // roi is stored as percentage (e.g., 50 for +50%, -100 for total loss)
            let totalPnL = 0;
            for (const sig of signals) {
                if (sig.roi !== null && sig.amountUSD) {
                    totalPnL += sig.amountUSD * (sig.roi / 100);
                }
            }

            // 3. Determine Tags
            const newTags: string[] = [];

            // SHARK: High Profit
            if (totalPnL >= SHARK_PNL_THRESHOLD) {
                newTags.push('SHARK');
                logger.info(`🦈 [Profiler] ${address.slice(0, 10)}... tagged as SHARK (PnL: $${totalPnL.toFixed(2)})`);
            }

            // SNIPER: High Accuracy (min 5 trades)
            if (totalTrades >= MIN_TRADES_FOR_CLASSIFICATION && winrate >= SNIPER_WINRATE_THRESHOLD) {
                newTags.push('SNIPER');
                logger.info(`🎯 [Profiler] ${address.slice(0, 10)}... tagged as SNIPER (Winrate: ${winrate.toFixed(1)}%)`);
            }

            // HAMSTER: Poor Performance (min 5 trades)
            if (totalTrades >= MIN_TRADES_FOR_CLASSIFICATION && winrate < HAMSTER_WINRATE_THRESHOLD) {
                newTags.push('HAMSTER');
                logger.info(`🐹 [Profiler] ${address.slice(0, 10)}... tagged as HAMSTER (Winrate: ${winrate.toFixed(1)}%)`);
            }

            // 4. Update Whale in Database
            const whale = await prisma.whale.findUnique({
                where: { address },
                select: { tags: true }
            });

            if (whale) {
                // Merge existing tags with new ones (avoid duplicates)
                const existingTags = whale.tags ? whale.tags.split(',').filter(t => t.trim()) : [];
                const mergedTags = [...new Set([...existingTags, ...newTags])];

                await prisma.whale.update({
                    where: { address },
                    data: {
                        tags: mergedTags.join(','),
                        winrate: winrate,
                        pnl: totalPnL,
                        lastAnalyzed: new Date()
                    }
                });

                if (newTags.length > 0) {
                    logger.info(`🔬 [Profiler] Updated ${address.slice(0, 10)}...: Tags=[${mergedTags.join(',')}] | WR=${winrate.toFixed(1)}% | PnL=$${totalPnL.toFixed(2)}`);
                }
            }

            return {
                address,
                totalTrades,
                wins,
                losses,
                winrate,
                totalPnL,
                newTags
            };

        } catch (e: any) {
            logger.error(`[Profiler] Error profiling ${address}:`, e.message);
            return null;
        }
    }

    /**
     * Batch profile update for all whales involved in a resolved market.
     */
    public async profileMarketParticipants(marketSlug: string): Promise<void> {
        try {
            // Get unique wallet addresses that traded on this market
            const signals = await prisma.signal.findMany({
                where: { marketSlug },
                select: { whaleAddress: true },
                distinct: ['whaleAddress']
            });

            const addresses = signals.map(s => s.whaleAddress);
            logger.info(`🔬 [Profiler] Profiling ${addresses.length} participants from ${marketSlug}`);

            for (const address of addresses) {
                await this.updateProfile(address);
            }

        } catch (e: any) {
            logger.error(`[Profiler] Batch profile error for ${marketSlug}:`, e.message);
        }
    }

    /**
     * Get profile summary for a wallet (read-only, no DB update).
     */
    public async getProfile(address: string): Promise<ProfileResult | null> {
        const signals = await prisma.signal.findMany({
            where: {
                whaleAddress: address,
                status: { in: ['WON', 'LOST'] }
            }
        });

        if (signals.length === 0) return null;

        const wins = signals.filter(s => s.status === 'WON').length;
        const totalTrades = signals.length;
        const winrate = (wins / totalTrades) * 100;

        let totalPnL = 0;
        for (const sig of signals) {
            if (sig.roi !== null && sig.amountUSD) {
                totalPnL += sig.amountUSD * (sig.roi / 100);
            }
        }

        // Determine what tags WOULD apply
        const newTags: string[] = [];
        if (totalPnL >= SHARK_PNL_THRESHOLD) newTags.push('SHARK');
        if (totalTrades >= MIN_TRADES_FOR_CLASSIFICATION && winrate >= SNIPER_WINRATE_THRESHOLD) newTags.push('SNIPER');
        if (totalTrades >= MIN_TRADES_FOR_CLASSIFICATION && winrate < HAMSTER_WINRATE_THRESHOLD) newTags.push('HAMSTER');

        return {
            address,
            totalTrades,
            wins,
            losses: totalTrades - wins,
            winrate,
            totalPnL,
            newTags
        };
    }
}
// Export singleton
export const profilerService = ProfilerService.getInstance();