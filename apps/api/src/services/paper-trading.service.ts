import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

export class PaperTradingService {
    private static instance: PaperTradingService;

    // Singleton pattern
    public static getInstance(): PaperTradingService {
        if (!PaperTradingService.instance) {
            PaperTradingService.instance = new PaperTradingService();
        }
        return PaperTradingService.instance;
    }

    private constructor() {
        console.log('📝 [PaperTrading] Service Initialized in Shadow Mode.');
    }

    // =========================================================================
    // 1. SIGNAL ENTRY (With Latency & Slippage)
    // =========================================================================
    public async onSignal(signal: any) {
        // Fetch Active Strategies
        const strategies = await prisma.strategy.findMany({
            where: { status: 'ACTIVE' }
        });

        if (strategies.length === 0) return;

        console.log(`📝 [PaperTrading] Evaluating Signal ${signal.id} against ${strategies.length} strategies...`);

        // Simulate Latency (Reaction Time)
        // Pessimistic assumption: Bot takes 5s to process and land tx
        setTimeout(async () => {
            await this.executeEntry(signal, strategies);
        }, 5000);
    }

    private async executeEntry(signal: any, strategies: any[]) {
        try {
            // Normalized Outcome
            const normalizedOutcome = (signal.outcome || '').trim(); // Case sensitivity handled in query usually but store clean

            for (const strategy of strategies) {
                const config = strategy.config as any;

                // Filter: Whales
                if (config.whales && Array.isArray(config.whales)) {
                    if (!config.whales.includes(signal.whaleAddress)) continue;
                }

                // Filter: Min Score
                if (config.minScore && signal.aiScore < config.minScore) continue;

                // Pessimistic Slippage (+1%)
                // If we BUY, we pay more. 
                // Price = signal.price * 1.01
                let entryPrice = signal.price * 1.01;
                if (entryPrice > 0.99) entryPrice = 0.99; // Cap at 0.99

                // Position Size
                const amount = config.betSize || 100; // Default $100

                // Create Position
                await prisma.paperPosition.create({
                    data: {
                        strategyId: strategy.id,
                        signalId: signal.id,
                        marketSlug: signal.marketSlug,
                        outcome: normalizedOutcome,
                        entryPrice: entryPrice,
                        amount: amount,
                        status: 'OPEN'
                    }
                });

                console.log(`📝 [PaperTrading] Opened Position for ${strategy.name}: ${normalizedOutcome} @ ${entryPrice.toFixed(2)}`);
            }
        } catch (e: any) {
            console.error('❌ [PaperTrading] Entry Failed:', e.message);
        }
    }

    // =========================================================================
    // 2. LIVE MONITORING (TP / SL / PANIC)
    // =========================================================================
    public async onMarketTrade(trade: any) {
        // Optimization: Only check if we have OPEN positions for this market
        // Trade has: marketSlug, outcome, price, actorAddress, side

        // [FIX] Trade API might not have slug directly populated in early flow, 
        // but Ingestor logic ensures we have it by the time we call this?
        // Ingestor calls this with processed data effectively.

        if (!trade.marketSlug) return;

        // Find relevant positions
        // We need to match Market AND Outcome
        // Normalize trade outcome
        const tradeOutcome = (trade.outcome || '').trim().toLowerCase();

        const positions = await prisma.paperPosition.findMany({
            where: {
                status: 'OPEN',
                marketSlug: trade.marketSlug
            },
            include: { strategy: true }
        });

        if (positions.length === 0) return;

        for (const pos of positions) {
            // Check Outcome Match
            // Store is "Yes", Trade is "Yes". 
            // Case-insensitive check
            if (pos.outcome.toLowerCase() !== tradeOutcome) continue;

            const config = pos.strategy.config as any;
            const currentPrice = Number(trade.price);

            // A. Panic Exit (Copy-Sell)
            // If the Whale who signaled this (or any whale in strategy?) sells.
            // Simplified: If "Smart Money" sells, we sell.
            if (trade.side === 'SELL' && trade.whaleAddress && trade.whaleAddress === trade.actorAddress) {
                // Wait, trade.actorAddress is what we track.
                // We need to know who 'Signaled' this position?
                // We didn't store 'whaleAddress' on PaperPosition, but we have 'signalId'.
                // To save DB lookup, let's assume if ANY 'Smart' actor sells, it's bad?
                // Better: Strategy config might say "Follow Whales".
                // If the actor is in the Strategy's whale list, and they SELL, we panic.

                if (config.whales && config.whales.includes(trade.actorAddress)) {
                    await this.closePosition(pos, currentPrice, 'PANIC_WHALE_DUMP');
                    continue;
                }
            }

            // B. Take Profit
            if (config.takeProfit) {
                // If Entry 0.50, TP 1.5x -> 0.75
                const target = pos.entryPrice * config.takeProfit;
                if (currentPrice >= target) {
                    await this.closePosition(pos, currentPrice, 'TP');
                    continue;
                }
            }

            // C. Stop Loss
            if (config.stopLoss) {
                // If Entry 0.50, SL 0.8x -> 0.40
                const target = pos.entryPrice * config.stopLoss;
                if (currentPrice <= target) {
                    await this.closePosition(pos, currentPrice, 'SL');
                    continue;
                }
            }
        }
    }

    // =========================================================================
    // 3. SETTLEMENT (Market Resolution)
    // =========================================================================
    public async onMarketResolved(slug: string, winningOutcome: string) {
        const positions = await prisma.paperPosition.findMany({
            where: {
                status: 'OPEN',
                marketSlug: slug
            }
        });

        if (positions.length === 0) return;

        const winnerNorm = winningOutcome.trim().toLowerCase();

        for (const pos of positions) {
            const posOutcome = pos.outcome.trim().toLowerCase();

            let exitPrice = 0;
            if (posOutcome === winnerNorm) {
                exitPrice = 1.0; // Max Payout
            } else {
                exitPrice = 0.0; // Total Loss
            }

            await this.closePosition(pos, exitPrice, 'RESOLVED');
        }
    }

    // Helper: Close Logic
    private async closePosition(pos: any, price: number, reason: string) {
        // Calculate PnL
        // Return = (Exit - Entry) / Entry
        // PnL $ = Amount * Return
        const roi = (price - pos.entryPrice) / pos.entryPrice;
        const pnl = pos.amount * roi;

        await prisma.paperPosition.update({
            where: { id: pos.id },
            data: {
                status: 'CLOSED',
                exitPrice: price,
                exitReason: reason,
                pnl: pnl,
                closedAt: new Date()
            }
        });

        console.log(`💰 [PaperTrading] Closed ${pos.id} (${reason}): PnL $${pnl.toFixed(2)} (${(roi * 100).toFixed(1)}%)`);
    }
}
