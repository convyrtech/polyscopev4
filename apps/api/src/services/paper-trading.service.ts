import { prisma } from '@whalescope/db';
import { calculateTradeCosts, calculateExitCosts, estimateGasCost, getBestAsk } from './liquidity.service';
import {
    MIN_LATENCY_MS,
    MAX_LATENCY_MS,
    PRICE_LOG_SAMPLE_RATE,
    MIN_BET_SIZE_USD,
    DEFAULT_BET_SIZE_USD,
    KELLY_MAX_PERCENT,
    SCORE_BASELINE,
    MIN_SCORE_MULTIPLIER,
    MAX_SCORE_MULTIPLIER,
    CRYPTO_KEYWORDS,
    POLITICS_KEYWORDS,
    PRICE_CEILING,
    PRICE_FLOOR_SOFT,
    HIGH_CONFIDENCE_SCORE_THRESHOLD,
    FALLBACK_EXIT_SLIPPAGE_PERCENT,
    MAX_TP_TARGET_PRICE,
    MIN_SL_TARGET_PRICE,
    MAX_PRICE_DEVIATION_PERCENT
} from '../lib/constants';
import { SignalInput, StrategyConfig, MarketTradeInput, PaperPositionWithStrategy } from '../lib/types';

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
        console.log('📝 [PaperTrading] Service Initialized in Shadow Mode (v2 - Realistic Costs)');
    }

    // =========================================================================
    // 1. SIGNAL ENTRY (With Realistic Latency & Dynamic Slippage)
    // =========================================================================
    public async onSignal(signal: SignalInput) {
        // [FIX] Hard guard: Reject Score 0 or undefined signals immediately
        if (!signal.aiScore || signal.aiScore === 0) {
            console.log(`🚫 [Paper] Rejected Signal: Score is ${signal.aiScore} (zero or undefined) | ${signal.marketSlug}`);
            return;
        }

        // Fetch Active Strategies
        const strategies = await prisma.strategy.findMany({
            where: { status: 'ACTIVE' }
        });

        if (strategies.length === 0) return;

        // Calculate REAL latency from signal timestamp
        let realLatencyMs = 0;
        if (signal.timestamp) {
            const signalTime = new Date(signal.timestamp).getTime();
            realLatencyMs = Date.now() - signalTime;

            // Warning for slow signals (> 5 seconds processing delay)
            if (realLatencyMs > 5000) {
                console.warn(`⚠️ [Paper] SLOW SIGNAL: Executing with ${realLatencyMs}ms lag | ${signal.marketSlug}`);
            }
        }

        console.log(`📝 [Paper] Received: ${signal.marketSlug} | Score: ${signal.aiScore} | Latency: ${realLatencyMs}ms`);

        // Simulate additional realistic execution latency
        // Real-world: detection + processing + tx confirmation varies
        const simulatedLatencyMs = MIN_LATENCY_MS + Math.floor(Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS));
        const totalLatencyMs = realLatencyMs + simulatedLatencyMs;

        setTimeout(async () => {
            try {
                await this.executeEntry(signal, strategies, totalLatencyMs);
            } catch (e: unknown) {
                const error = e as Error;
                console.error(`❌ [PaperTrading] Critical Error in delayed execution: ${error.message}`, error.stack);
            }
        }, simulatedLatencyMs);
    }

    private async executeEntry(signal: SignalInput, strategies: { id: string; name: string; config: unknown; currentBalance: number; status: string }[], latencyMs: number) {
        try {
            // Normalized Outcome
            const normalizedOutcome = (signal.outcome || '').trim();

            // =====================================================================
            // OPTIMIZATION: Batch fetch existing positions to avoid N+1
            // =====================================================================
            const existingPositions = await prisma.paperPosition.findMany({
                where: {
                    marketSlug: signal.marketSlug,
                    status: 'OPEN'
                },
                select: { strategyId: true }
            });
            const strategiesWithOpenPosition = new Set(existingPositions.map(p => p.strategyId));
            // =====================================================================

            for (const strategy of strategies) {
                const config = strategy.config as StrategyConfig;

                console.log('🔍 [Paper] Checking Strategy:', strategy.name, 'MinScore:', config.minScore, 'ActScore:', signal.aiScore);

                // Filter: Whales
                if (config.whales && Array.isArray(config.whales) && config.whales.length > 0) {
                    if (!config.whales.includes(signal.whaleAddress)) continue;
                }

                // [FORCE UPDATE] Strict Filtering Logic
                // 1. Min Score Filter
                const minScore = config.minScore !== undefined ? Number(config.minScore) : 0;
                if (signal.aiScore < minScore) {
                    continue;
                }

                // 1b. Max Score Filter (for bucket strategies)
                if (config.maxScore !== undefined) {
                    const maxScore = Number(config.maxScore);
                    if (signal.aiScore > maxScore) {
                        continue;
                    }
                }

                // 1c. Market Type Filter (uses centralized keywords)
                if (config.marketFilter) {
                    const slug = signal.marketSlug?.toLowerCase() || '';
                    const filter = config.marketFilter.toLowerCase();

                    if (filter === 'crypto') {
                        const isCrypto = CRYPTO_KEYWORDS.some(kw => slug.includes(kw));
                        if (!isCrypto) continue;
                    } else if (filter === 'politics') {
                        const isPolitics = POLITICS_KEYWORDS.some(kw => slug.includes(kw));
                        if (!isPolitics) continue;
                    }
                }

                // NOTE: maxPrice/minPrice filters moved AFTER entryPrice calculation
                // We need to check against actual entry price, not whale's signal.price
                // See below after slippage calculation

                // 3. Min Volume Filter
                if (config.minVol !== undefined) {
                    const minVol = Number(config.minVol);
                    if (signal.amountUSD < minVol) {
                        continue;
                    }
                }

                // ================== SMART POSITION SIZING ==================
                // Uses Kelly-inspired dynamic sizing based on signal confidence
                const baseBetSize = config.betSize || DEFAULT_BET_SIZE_USD;
                let betSize = baseBetSize;

                // Dynamic Sizing: Linear scale from score
                // Score 100 → 1.5x, Score 70 → 1.0x, Score 40 → 0.5x
                if (config.dynamicSizing !== false) { // Default: enabled
                    // Linear interpolation: multiplier = 0.5 + (score/100) * 1.0
                    // This gives: score 0 → 0.5x, score 50 → 1.0x, score 100 → 1.5x
                    // But we want score 70 = 1.0x baseline, so adjust:
                    // multiplier = MIN + (score - 40) / (100 - 40) * (MAX - MIN)
                    // At score 40: MIN=0.5, At score 100: MAX=1.5, At score 70: ~1.0
                    const normalizedScore = Math.max(0, Math.min(100, signal.aiScore));
                    const scoreRange = 100 - 40; // 60 points range
                    const multiplierRange = MAX_SCORE_MULTIPLIER - MIN_SCORE_MULTIPLIER; // 1.0 range
                    const multiplier = MIN_SCORE_MULTIPLIER + ((normalizedScore - 40) / scoreRange) * multiplierRange;
                    const clampedMultiplier = Math.max(MIN_SCORE_MULTIPLIER, Math.min(MAX_SCORE_MULTIPLIER, multiplier));

                    betSize = Math.round(baseBetSize * clampedMultiplier);

                    // Kelly-style cap: Never bet more than KELLY_MAX_PERCENT of current balance
                    const maxKellyBet = strategy.currentBalance * KELLY_MAX_PERCENT;
                    if (betSize > maxKellyBet && maxKellyBet >= MIN_BET_SIZE_USD) {
                        betSize = Math.floor(maxKellyBet);
                    }
                }

                // Minimum bet size guard
                if (betSize < MIN_BET_SIZE_USD) betSize = MIN_BET_SIZE_USD;
                // ============================================================

                // ================== DUPLICATE POSITION CHECK ==================
                // [OPTIMIZED] Use pre-fetched set instead of N+1 queries
                if (strategiesWithOpenPosition.has(strategy.id)) {
                    console.log(`⏭️ [Paper] Skipping ${strategy.name}: Already OPEN on ${signal.marketSlug}`);
                    continue;
                }
                // ==============================================================

                // ================== BANKROLL MANAGEMENT ==================
                // Pre-trade check: Insufficient funds
                if (strategy.currentBalance < betSize) {
                    console.log(`🚫 [Paper] Insufficient Funds for ${strategy.name}: $${strategy.currentBalance.toFixed(2)} < $${betSize}`);
                    continue;
                }

                // ================================================================
                // COMPUTE ALL DATA BEFORE ANY DB OPERATIONS
                // This prevents holding DB locks during external API calls
                // ================================================================

                const tokenId = signal.tokenId || signal.conditionId || null;

                // Step 1: Get current Best Ask from Order Book
                let marketPrice: number;
                let skipReason: string | null = null;

                if (tokenId) {
                    const bestAsk = await getBestAsk(tokenId);

                    if (bestAsk === null) {
                        // No order book data - use signal.price as fallback
                        console.log(`⚠️ [Paper] No order book for ${strategy.name}, using signal.price as fallback`);
                        marketPrice = signal.price;
                    } else {
                        marketPrice = bestAsk;

                        // Step 2: Check if price moved too much from whale's entry
                        const priceDeviation = Math.abs(bestAsk - signal.price) / signal.price;

                        if (priceDeviation > MAX_PRICE_DEVIATION_PERCENT) {
                            skipReason = `SKIPPED_PRICE_MOVED: BestAsk ${bestAsk.toFixed(3)} vs Signal ${signal.price.toFixed(3)} (${(priceDeviation * 100).toFixed(1)}% deviation > ${MAX_PRICE_DEVIATION_PERCENT * 100}%)`;
                        } else {
                            console.log(`📊 [Paper] Using BestAsk ${bestAsk.toFixed(3)} (signal was ${signal.price.toFixed(3)}, deviation ${(priceDeviation * 100).toFixed(1)}%)`);
                        }
                    }
                } else {
                    // No tokenId - fallback to signal.price
                    console.log(`⚠️ [Paper] No tokenId for ${strategy.name}, using signal.price`);
                    marketPrice = signal.price;
                }

                // Early exit if price moved too much
                if (skipReason) {
                    console.log(`🚫 [Paper] ${strategy.name}: ${skipReason}`);
                    continue;
                }

                // Step 3: Calculate slippage based on market price (with real order book if available)
                const costs = await calculateTradeCosts(
                    tokenId,  // Use real order book for slippage calculation
                    'BUY',
                    betSize,
                    marketPrice  // Use current market price as base
                );

                // Effective entry price after slippage
                const entryPrice = costs.effectiveEntry;

                // ================================================================
                // CONFIG LIMIT CHECKS (Now on actual entry price, not signal.price)
                // All checks happen BEFORE any DB operations
                // ================================================================

                // Max Price Check: config.maxPrice AND global PRICE_CEILING
                const effectiveMaxPrice = config.maxPrice !== undefined
                    ? Math.min(Number(config.maxPrice), PRICE_CEILING)
                    : PRICE_CEILING;

                if (entryPrice > effectiveMaxPrice) {
                    console.log(`⏭️ [Paper] Skipping ${strategy.name}: Entry ${entryPrice.toFixed(3)} > maxPrice ${effectiveMaxPrice}`);
                    continue;
                }

                // Min Price Check: config.minPrice with bypass for high-confidence signals
                const bypassMinPrice = signal.aiScore >= HIGH_CONFIDENCE_SCORE_THRESHOLD;

                if (!bypassMinPrice) {
                    const effectiveMinPrice = config.minPrice !== undefined
                        ? Math.max(Number(config.minPrice), PRICE_FLOOR_SOFT)
                        : PRICE_FLOOR_SOFT;

                    if (entryPrice < effectiveMinPrice) {
                        console.log(`⏭️ [Paper] Skipping ${strategy.name}: Entry ${entryPrice.toFixed(3)} < minPrice ${effectiveMinPrice}`);
                        continue;
                    }
                } else if (entryPrice < PRICE_FLOOR_SOFT) {
                    console.log(`🎰 [Paper] LOW PRICE INSIDER! ${strategy.name}: Entry ${entryPrice.toFixed(3)} allowed due to high aiScore ${signal.aiScore}`);
                }

                // Calculate shares purchased
                const shares = betSize / entryPrice;

                // Log slippage info
                console.log(`💰 [Paper] Costs: Slippage ${costs.entrySlippage.slippagePercent.toFixed(2)}% ($${costs.entrySlippage.slippageCost.toFixed(2)}) | Gas: $${costs.gasCost.toFixed(2)} | Source: ${costs.entrySlippage.source}`);

                // ================================================================
                // ATOMIC TRANSACTION: Debit balance + Create position
                // If either fails, both rollback - no money lost!
                // ================================================================
                try {
                    const positionData = {
                        strategyId: strategy.id,
                        signalId: signal.id,
                        marketSlug: signal.marketSlug,
                        outcome: normalizedOutcome,
                        tokenId: tokenId,
                        entryPrice: entryPrice,
                        amountUSD: betSize,
                        shares: shares,
                        entrySlippage: costs.entrySlippage.slippageCost,
                        gasCost: costs.gasCost,
                        latencyMs: latencyMs,
                        totalSlippage: costs.entrySlippage.slippageCost,
                        status: 'OPEN'
                    };

                    const [updatedStrategy, _position] = await prisma.$transaction([
                        prisma.strategy.update({
                            where: {
                                id: strategy.id,
                                // Optimistic lock: only update if balance still sufficient
                                currentBalance: { gte: betSize }
                            },
                            data: { currentBalance: { decrement: betSize } }
                        }),
                        prisma.paperPosition.create({
                            data: positionData
                        })
                    ]);

                    // Update local copy for logging
                    strategy.currentBalance = updatedStrategy.currentBalance;

                    console.log(`✅ [Paper] Opened for ${strategy.name}: ${normalizedOutcome} @ ${entryPrice.toFixed(3)} (${shares.toFixed(2)} shares) | Bet: $${betSize} | Balance: $${strategy.currentBalance.toFixed(2)} | Latency: ${latencyMs}ms`);
                } catch (txError: unknown) {
                    const error = txError as Error;
                    // Transaction failed - balance remains untouched (atomic rollback)
                    console.log(`⚠️ [Paper] Transaction failed for ${strategy.name}: ${error.message} (balance unchanged)`);
                    continue;
                }
            }
        } catch (e: unknown) {
            const error = e as Error;
            console.error('❌ [PaperTrading] Entry Failed:', error.message);
        }
    }

    // =========================================================================
    // 2. LIVE MONITORING (TP / SL / PANIC)
    // =========================================================================
    public async onMarketTrade(trade: MarketTradeInput) {
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

        // Sampled Log (controlled rate to avoid spam)
        if (Math.random() < PRICE_LOG_SAMPLE_RATE) {
            console.log('📉 [Paper] Price Update:', trade.marketSlug, trade.price);
        }

        for (const pos of positions) {
            // Check Outcome Match
            // Store is "Yes", Trade is "Yes". 
            // Case-insensitive check
            if (pos.outcome.toLowerCase() !== tradeOutcome) continue;

            const config = pos.strategy.config as StrategyConfig;
            const currentPrice = Number(trade.price);

            // A. Panic Exit (Copy-Sell)
            // If the Whale who signaled this (or any whale in strategy?) sells.
            // Simplified: If "Smart Money" sells, we sell.
            // A. Panic Exit (Copy-Sell)
            // If a whale monitored by this strategy sells, we exit.
            if (trade.side === 'SELL' && trade.actorAddress) {
                if (config.whales && config.whales.includes(trade.actorAddress)) {
                    // Check if this specific whale is in our strategy's list
                    await this.closePosition(pos, currentPrice, 'PANIC_WHALE_DUMP');
                    continue;
                }
            }

            // B. Take Profit
            // [FIX] For prediction markets, max price = 1.0
            // TP should be based on % of potential profit, not % of entry price
            // Potential profit = 1.0 - entryPrice
            // E.g., entry 0.60, TP 50% of profit = 0.60 + (0.40 * 0.50) = 0.80
            if (config.takeProfit) {
                const potentialProfit = 1.0 - pos.entryPrice;
                const profitTarget = potentialProfit * config.takeProfit;
                const targetPrice = Math.min(pos.entryPrice + profitTarget, MAX_TP_TARGET_PRICE);

                if (currentPrice >= targetPrice) {
                    // [CRITICAL FIX 2025-01-26] Use targetPrice, NOT currentPrice!
                    // Problem: Old code used currentPrice which overstates profit.
                    // Example: Entry 0.55, TP target 0.775, currentPrice 0.87
                    //   Wrong: closeAt 0.87 = +58% profit (FAKE!)
                    //   Right: closeAt 0.775 = +41% profit (REALISTIC)
                    // Real trading uses limit orders that fill at target, not market sweeps.
                    await this.closePosition(pos, targetPrice, 'TP');
                    continue;
                }
            }

            // C. Stop Loss
            // [FIX] SL is % loss of entry price, but we need to ensure it's reachable
            // Max loss = entry price (price can go to 0)
            if (config.stopLoss) {
                const lossAmount = pos.entryPrice * config.stopLoss;
                const targetPrice = Math.max(pos.entryPrice - lossAmount, MIN_SL_TARGET_PRICE);

                if (currentPrice <= targetPrice) {
                    // [CRITICAL FIX 2025-01-26] Use targetPrice, NOT currentPrice!
                    // For CONSERVATIVE model, SL fills at target (worst case).
                    // If market gaps down past SL, we simulate filling at SL level.
                    // Real trading: Limit orders fill at limit price or better.
                    await this.closePosition(pos, targetPrice, 'SL');
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
            },
            include: { strategy: true }  // Include strategy for closePosition
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

    /**
     * Handle VOID/INVALID market resolution
     * Refunds the full bet amount to the strategy (no win, no loss)
     */
    public async onMarketVoid(slug: string) {
        const positions = await prisma.paperPosition.findMany({
            where: {
                status: 'OPEN',
                marketSlug: slug
            },
            include: { strategy: true }
        });

        if (positions.length === 0) return;

        console.log(`🔄 [Paper] VOID market ${slug}: Refunding ${positions.length} positions`);

        for (const pos of positions) {
            // For VOID: exit at entry price (no profit, no loss before costs)
            // We still deduct entry costs that were already paid

            const shares = pos.shares || (pos.amountUSD / pos.entryPrice);
            const entrySlippageCost = pos.entrySlippage || 0;
            const entryGasCost = pos.gasCost || 0;

            // Net PnL = -entry costs only (the bet amount is refunded)
            const netPnl = -(entrySlippageCost + entryGasCost);

            // Exit value = original bet (shares at entry price)
            // No exit slippage for VOID since there's no actual trade
            const exitValue = pos.amountUSD;

            // Update position
            await prisma.paperPosition.update({
                where: { id: pos.id },
                data: {
                    status: 'CLOSED_VOID',
                    exitPrice: pos.entryPrice,  // Exit at entry (refund)
                    exitReason: 'VOID',
                    pnl: netPnl,
                    exitSlippage: 0,
                    exitValue: exitValue,
                    closedAt: new Date()
                }
            });

            // Credit back to strategy balance (full refund of bet)
            await prisma.strategy.update({
                where: { id: pos.strategyId },
                data: {
                    currentBalance: { increment: exitValue }
                }
            });

            console.log(`🔄 [Paper] VOID Position ${pos.id}: Refunded $${exitValue.toFixed(2)} to ${pos.strategy.name} | Net: $${netPnl.toFixed(2)}`);
        }
    }

    // Helper: Close Logic (with Bankroll Credit + Exit Costs)
    private async closePosition(pos: PaperPositionWithStrategy, price: number, reason: string) {
        // Calculate exit slippage (selling our shares)
        const tokenId = pos.tokenId || null;
        const shares = pos.shares || (pos.amountUSD / pos.entryPrice);

        let exitSlippageCost = 0;
        let effectiveExitPrice = price;
        let exitGasCost = 0;

        // Only apply exit slippage for non-resolution exits (TP/SL/PANIC)
        // Resolution pays out exactly 1 or 0, no slippage
        if (reason !== 'RESOLVED' && price > 0 && price < 1) {
            if (tokenId) {
                const exitCosts = await calculateExitCosts(tokenId, shares, price);
                exitSlippageCost = exitCosts.slippageCost;
                effectiveExitPrice = exitCosts.effectivePrice;
            } else {
                // Fallback: estimate exit slippage if no tokenId
                // [CRITICAL FIX 2025-01-26] Use current position value (shares * price), NOT initial bet!
                // Bug was: exitSlippageCost = pos.amountUSD * FALLBACK_EXIT_SLIPPAGE_PERCENT
                // If position grew from $50 @ 0.55 to 0.78, current value = 90.9 * 0.78 = $70.9
                // Slippage must be calculated on $70.9, not $50
                const currentValueUSD = shares * price;
                exitSlippageCost = currentValueUSD * FALLBACK_EXIT_SLIPPAGE_PERCENT;
                effectiveExitPrice = price * (1 - FALLBACK_EXIT_SLIPPAGE_PERCENT); // Worse price for selling
            }
            exitGasCost = estimateGasCost();

            console.log(`💸 [Paper] Exit Costs: Slippage $${exitSlippageCost.toFixed(2)} | Gas: $${exitGasCost.toFixed(2)} | TokenID: ${tokenId ? 'Real' : 'Fallback'}`);
        }

        // =====================================================================
        // PnL CALCULATION (Fixed: Entry costs now properly included)
        // =====================================================================

        // Gross PnL = (Exit - Entry) * shares
        const grossPnl = (effectiveExitPrice - pos.entryPrice) * shares;

        // Entry costs (already paid at entry, must subtract from PnL)
        const entrySlippageCost = pos.entrySlippage || 0;
        const entryGasCost = pos.gasCost || 0;

        // Total costs = ALL slippage + ALL gas
        const totalCosts = entrySlippageCost + exitSlippageCost + entryGasCost + exitGasCost;

        // Net PnL = Gross - ALL exit costs (entry costs were paid from initial bet)
        // Entry costs reduce the effective shares we got, exit costs reduce exit value
        // Since entry slippage is baked into entryPrice, we only subtract exit costs here
        const netPnl = grossPnl - exitSlippageCost - exitGasCost;

        // Exit value = what we get back = shares * exitPrice - exit costs
        // We invested pos.amountUSD, got shares at entryPrice (with slippage baked in)
        // Now we sell shares at effectiveExitPrice
        const exitValue = Math.max(0, shares * effectiveExitPrice - exitSlippageCost - exitGasCost);

        // Determine status based on outcome
        let status = 'CLOSED_WON';
        if (reason === 'TP') status = 'CLOSED_TP';
        else if (reason === 'SL') status = 'CLOSED_SL';
        else if (exitValue < pos.amountUSD) status = 'CLOSED_LOST'; // Lost money overall

        // Update position with all cost data
        const totalGasCost = entryGasCost + exitGasCost;
        const totalSlippageCost = entrySlippageCost + exitSlippageCost;

        await prisma.paperPosition.update({
            where: { id: pos.id },
            data: {
                status: status,
                exitPrice: effectiveExitPrice,
                exitReason: reason,
                pnl: exitValue - pos.amountUSD, // Real PnL = what we got back - what we invested
                exitSlippage: exitSlippageCost,
                exitValue: exitValue,
                totalSlippage: totalSlippageCost,
                gasCost: totalGasCost,
                closedAt: new Date()
            }
        });

        // Credit balance back to strategy
        await prisma.strategy.update({
            where: { id: pos.strategyId },
            data: { currentBalance: { increment: exitValue } }
        });

        const actualPnl = exitValue - pos.amountUSD;
        const roi = pos.amountUSD > 0 ? (actualPnl / pos.amountUSD) * 100 : 0;
        console.log(`💰 [Paper] Closed ${pos.id} (${reason}): PnL $${actualPnl.toFixed(2)} (${roi.toFixed(1)}%) | Costs: $${totalCosts.toFixed(2)} | Credited: $${exitValue.toFixed(2)}`);
    }
}
