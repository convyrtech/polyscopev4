import { PrismaClient } from '@whalescope/db';
import axios from 'axios';

const prisma = new PrismaClient();
const DATA_API_URL = 'https://data-api.polymarket.com/trades';

interface TradeHistoryItem {
    asset: string;
    side: 'BUY' | 'SELL';
    size: number;
    price: number;
    timestamp: number;
    transactionHash: string;
}

export class WhaleService {
    private static queue: string[] = [];
    private static processingCount = 0;
    private static MAX_CONCURRENT = 2;
    private static MAX_QUEUE_SIZE = 100;

    /**
     * Adds an address to the analysis queue.
     * Implements Load Shedding (drops oldest if full).
     */
    static async queueAnalysis(address: string) {
        if (!address || address === '0x0000000000000000000000000000000000000000') return;

        // Dedup
        if (this.queue.includes(address)) return;

        if (this.queue.length >= this.MAX_QUEUE_SIZE) {
            // Load Shedding
            this.queue.shift();
            // console.warn('[WhaleService] Queue full! Dropped oldest item.');
        }

        this.queue.push(address);
        this.processQueue();
    }

    private static async processQueue() {
        if (this.processingCount >= this.MAX_CONCURRENT) return;
        if (this.queue.length === 0) return;

        const address = this.queue.shift();
        if (!address) return;

        this.processingCount++;

        try {
            await this.performAnalysis(address);
        } catch (e) {
            console.error(`[WhaleService] Error processing ${address}:`, e.message);
        } finally {
            this.processingCount--;
            // Trigger next
            this.processQueue();
        }
    }

    private static async performAnalysis(address: string) {
        // 1. Cache Check
        const existing = await prisma.whale.findUnique({
            where: { address }
        });

        if (existing && existing.lastAnalyzed) {
            const diffMs = Date.now() - new Date(existing.lastAnalyzed).getTime();
            const oneHourMs = 60 * 60 * 1000;
            if (diffMs < oneHourMs) {
                // Buffer period - maybe update lastActive only?
                return;
            }
        }

        // 2. Fetch Data
        // console.log(`🔍 [WhaleService] Fetching history for ${address.slice(0, 6)}...`);
        const response = await axios.get(DATA_API_URL, {
            params: {
                maker_address: address,
                limit: 500
            }
        });

        const trades = response.data as TradeHistoryItem[];
        if (!Array.isArray(trades) || trades.length === 0) return;

        // 3. The Math (PnL Calculation)
        const assets: Record<string, { buyQty: number; buyCost: number; sellQty: number; sellRev: number }> = {};

        let totalVolume = 0;

        for (const t of trades) {
            const volume = t.price * t.size;
            totalVolume += volume;

            if (!assets[t.asset]) {
                assets[t.asset] = { buyQty: 0, buyCost: 0, sellQty: 0, sellRev: 0 };
            }

            if (t.side === 'BUY') {
                assets[t.asset].buyQty += t.size;
                assets[t.asset].buyCost += volume;
            } else {
                assets[t.asset].sellQty += t.size;
                assets[t.asset].sellRev += volume;
            }
        }

        // Calculate Realized PnL & Winrate
        let totalRealizedPnL = 0;
        let profitableTrades = 0;
        let realizedCount = 0;

        for (const assetId in assets) {
            const a = assets[assetId];
            if (a.sellQty > 0 && a.buyQty > 0) {
                // Avg Buy Price
                const avgBuyPrice = a.buyCost / a.buyQty;
                // Quantify how much we actually sold (capped by what we bought)
                const realizedQty = Math.min(a.sellQty, a.buyQty);

                // Revenue part that is realized
                const avgSellPrice = a.sellRev / a.sellQty;

                const pnl = (avgSellPrice - avgBuyPrice) * realizedQty;
                totalRealizedPnL += pnl;
                realizedCount++;

                if (pnl > 0) profitableTrades++;
            }
        }

        const winrate = realizedCount > 0 ? (profitableTrades / realizedCount) * 100 : 0;

        // 4. Grading
        const tags: string[] = [];
        if (totalVolume > 50000) tags.push('WHALE');
        if (winrate > 60 && realizedCount > 10) tags.push('SMART');
        if (totalRealizedPnL < -1000) tags.push('HAMSTER');
        if (realizedCount > 50 && winrate < 40) tags.push('DEGEN');

        // 5. DB Update
        await prisma.whale.upsert({
            where: { address },
            update: {
                lastAnalyzed: new Date(),
                lastActive: new Date(),
                pnl: totalRealizedPnL,
                winrate: winrate,
                volume: totalVolume,
                tags: tags.join(','),
                score: this.calculateScore(totalRealizedPnL, winrate, totalVolume)
            },
            create: {
                address,
                lastAnalyzed: new Date(),
                lastActive: new Date(),
                pnl: totalRealizedPnL,
                winrate: winrate,
                volume: totalVolume,
                tags: tags.join(','),
                score: this.calculateScore(totalRealizedPnL, winrate, totalVolume)
            }
        });

        console.log(`🐳 [WhaleService] Processed ${address.slice(0, 6)}: PnL $${totalRealizedPnL.toFixed(0)} | Queue: ${this.queue.length}`);
    }

    private static calculateScore(pnl: number, winrate: number, volume: number): number {
        // Simple heuristic for now
        let score = 50;
        if (pnl > 1000) score += 20;
        if (pnl < 0) score -= 20;
        if (winrate > 60) score += 15;
        if (volume > 100000) score += 15;
        return Math.min(100, Math.max(0, score));
    }
}
