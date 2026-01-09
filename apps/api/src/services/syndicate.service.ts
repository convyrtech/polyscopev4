import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

/**
 * SyndicateService
 * Detects coordinated whale activity in the same market.
 * A "syndicate move" suggests multiple whales are betting together,
 * which can indicate valuable insider information even in sports markets.
 */
export class SyndicateService {
    private static instance: SyndicateService;

    public static getInstance(): SyndicateService {
        if (!SyndicateService.instance) {
            SyndicateService.instance = new SyndicateService();
        }
        return SyndicateService.instance;
    }

    /**
     * Check if multiple distinct whales have traded this market recently.
     * @param marketSlug - The market identifier
     * @param timeWindowMs - Time window to check (default 5 minutes)
     * @returns true if 2+ distinct whales traded in the window
     */
    async isSyndicateMove(marketSlug: string, timeWindowMs: number = 300000): Promise<boolean> {
        try {
            const cutoff = new Date(Date.now() - timeWindowMs);

            // Count distinct whale addresses in recent signals for this market
            const recentSignals = await prisma.signal.findMany({
                where: {
                    marketSlug: marketSlug,
                    timestamp: { gte: cutoff }
                },
                select: { whaleAddress: true },
                distinct: ['whaleAddress']
            });

            const distinctWhales = recentSignals.length;

            if (distinctWhales >= 2) {
                console.log(`🐋🐋 [Syndicate] Detected ${distinctWhales} whales in ${marketSlug} (last ${timeWindowMs / 60000}min)`);
                return true;
            }

            return false;
        } catch (e: any) {
            console.error('❌ [Syndicate] Check failed:', e.message);
            return false;
        }
    }
}
