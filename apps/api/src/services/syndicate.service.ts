import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

interface TrackedTrade {
    wallet: string;
    outcome: string;
    timestamp: number;
}

/**
 * SyndicateService
 * Detects coordinated whale activity in the same market.
 * Logic: If 3 unique wallets buy the SAME outcome in the same market within 60s -> Syndicate!
 */
export class SyndicateService {
    private static instance: SyndicateService;

    // Memory Store: MarketSlug -> List of recent trades
    private recentTrades: Map<string, TrackedTrade[]> = new Map();

    public static getInstance(): SyndicateService {
        if (!SyndicateService.instance) {
            SyndicateService.instance = new SyndicateService();
        }
        return SyndicateService.instance;
    }

    /**
     * Record a trade to track potential syndicate formation
     */
    public recordTrade(marketSlug: string, wallet: string, outcome: string) {
        const now = Date.now();
        const trades = this.recentTrades.get(marketSlug) || [];

        // Prune old trades (> 60s)
        const relevantTrades = trades.filter(t => now - t.timestamp < 60000);

        // Add new trade
        relevantTrades.push({ wallet, outcome, timestamp: now });

        this.recentTrades.set(marketSlug, relevantTrades);
    }

    /**
     * Check if a syndicate is active for a specific outcome
     * Criteria: 3 unique wallets buying SAME outcome in last 60s
     */
    public isSyndicateActive(marketSlug: string, outcome: string): boolean {
        const trades = this.recentTrades.get(marketSlug);
        if (!trades) return false;

        // Filter for specific outcome
        const outcomeTrades = trades.filter(t => t.outcome === outcome);

        // Count unique wallets
        const uniqueWallets = new Set(outcomeTrades.map(t => t.wallet));

        if (uniqueWallets.size >= 3) {
            console.log(`🦅 [Syndicate] DETECTED in ${marketSlug} for "${outcome}"! (${uniqueWallets.size} unique wallets)`);
            return true;
        }

        return false;
    }

    /**
     * Legacy/Fallback: Check via DB (longer window)
     * Used for general sports bypass if needed, but Project 5X relies on the fast in-memory check above.
     */
    async isSyndicateMove(marketSlug: string, timeWindowMs: number = 300000): Promise<boolean> {
        // ... (Optional: keep existing implementation or redirect to checking memory if window is small)
        // For now, let's keep the simple DB check for broader context if referenced elsewhere
        try {
            const cutoff = new Date(Date.now() - timeWindowMs);
            const recentSignals = await prisma.signal.findMany({
                where: {
                    marketSlug: marketSlug,
                    timestamp: { gte: cutoff }
                },
                select: { whaleAddress: true },
                distinct: ['whaleAddress']
            });
            return recentSignals.length >= 2;
        } catch (e) {
            return false;
        }
    }
}
