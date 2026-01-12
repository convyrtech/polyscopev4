import WebSocket from 'ws';
import axios, { AxiosError } from 'axios';
import { prisma } from '@whalescope/db';
import { AnalysisService, TradeData } from './services/analysis.service';
import { StrategyService, StrategyType, SignalCandidate } from './services/strategy.service';
import { RiskService } from './services/risk.service';
import { PaperTradingService } from './services/paper-trading.service';
import { SyndicateService } from './services/syndicate.service';
import { withRetry } from './lib/retry';
import { DataApiTradeSchema, DataApiTrade, GammaMarket, GammaMarketToken, parseApiResponse } from './lib/schemas';
import { INGESTOR_CONFIG } from './lib/config';
import { PRICE_CEILING, BANNED_MARKET_PATTERNS } from './lib/constants';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const GAMMA_URL = 'https://gamma-api.polymarket.com/markets';
const TRADE_API_URL = 'https://data-api.polymarket.com/trades';

// Cache to store slug/question for incoming asset IDs
interface MarketCache {
    slug: string;
    question: string;
    conditionId: string;
    description?: string;
    tokens?: GammaMarketToken[];
    outcome?: string;
    expiryDate?: Date;
    volume?: number;
}

export class PolymarketIngestor {
    // --- STREAMS ---
    private ws: WebSocket | null = null;
    private pollingInterval: NodeJS.Timeout | null = null;

    // --- STATE ---
    private isConnected = false;
    private marketCache: Map<string, MarketCache> = new Map(); // asset_id -> Info
    private processedTradeIds: Set<string> = new Set(); // Dedup for HTTP
    private readonly MAX_PROCESSED_IDS = INGESTOR_CONFIG.MAX_PROCESSED_IDS;
    private readonly MAX_EVENT_MAP_SIZE = INGESTOR_CONFIG.MAX_EVENT_MAP_SIZE;
    private currentAssetIndex = 0; // [NEW] For Round Robin
    private pingInterval: NodeJS.Timeout | null = null; // Prevent interval leaks
    private discoveryInterval: NodeJS.Timeout | null = null; // Auto-discovery interval
    private isShuttingDown = false; // Graceful shutdown flag

    // --- SERVICES ---
    private analysisService = new AnalysisService();
    private strategyService = new StrategyService();
    private riskService = new RiskService();
    private paperTradingService = PaperTradingService.getInstance();
    private syndicateService = SyndicateService.getInstance();

    constructor() {
        console.log('🐳 Hybrid Ingestor Initialized (Stream A: WS Pulse + Stream B: HTTP Detective)');
    }

    public async start() {
        // 1. Refresh Cache (Gamma) & Start Auto-Discovery
        await this.startAutoDiscovery(); // [NEW] Replaces simple cache refresh
        // Note: startAutoDiscovery sets its own interval

        // 2. Start Stream A (WS Pulse)
        this.connectWs();

        // 3. Start Stream B (HTTP Detective) - NOW ROUND ROBIN
        this.startPolling();
    }

    // =========================================================================
    // 🌊 STREAM A: The "Pulse" (WebSocket)
    // Goal: Instant "Activity" feel. No DB writes for Signals to avoid spam.
    // =========================================================================

    private connectWs() {
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.terminate();
        }

        this.ws = new WebSocket(WS_URL);

        this.ws.on('open', async () => {
            console.log('⚡ [Stream A] WS Connected (The Pulse)');
            this.isConnected = true;
            this.subscribeToTopMarkets();
            this.startPing();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const msgString = data.toString();
                if (msgString.includes("INVALID")) return;
                const message = JSON.parse(msgString);

                // Process real-time trades from WebSocket
                const events = Array.isArray(message) ? message : [message];
                for (const e of events) {
                    if (e.event_type === 'last_trade_price' || e.event_type === 'trade') {
                        // WS events don't have maker_address - use as trigger for HTTP fetch
                        if (e.asset_id) {
                            // Trigger immediate HTTP fetch for this asset to get full trade data
                            // [FIX] Log error, don't swallow
                            this.fetchTradesForAsset(e.asset_id).catch(err =>
                                console.warn(`⚠️ [Stream A] Trigger Fetch Fail ${e.asset_id}:`, err.message)
                            );
                        }
                    }
                }
            } catch (error) {
                // Ignore parsing errors for pulse
            }
        });

        this.ws.on('close', (code, reason) => {
            console.warn(`⚠️ [Stream A] WS Closed: code=${code}, reason=${reason?.toString() || 'none'}, reconnecting in ${INGESTOR_CONFIG.WS_RECONNECT_DELAY}ms...`);
            this.isConnected = false;
            setTimeout(() => this.connectWs(), INGESTOR_CONFIG.WS_RECONNECT_DELAY);
        });

        this.ws.on('error', (err) => console.error('❌ [Stream A] WS Error:', err.message));
    }

    private startPing() {
        // Clear previous interval to prevent memory leak on reconnect
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, INGESTOR_CONFIG.WS_PING_INTERVAL);
    }

    private async subscribeToTopMarkets() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Get Asset IDs from Cache
        const assetIds = Array.from(this.marketCache.keys());
        if (assetIds.length === 0) return;

        const chunk = assetIds.slice(0, INGESTOR_CONFIG.WS_SUBSCRIBE_LIMIT);
        this.ws.send(JSON.stringify({ assets_ids: chunk }));
        console.log(`⚡ [Stream A] Subscribed to ${chunk.length} markets for Pulse.`);
    }

    // =========================================================================
    // 🕵️ STREAM B: The "Detective" (HTTP Polling)
    // Goal: Accurate Identity, Deduplication, DB Storage
    // NOW: Round Robin Strategy to cover unlimited markets
    // =========================================================================

    private startPolling() {
        console.log('🕵️ [Stream B] Starting HTTP Round Robin (The Detective)...');
        // Tick at configured interval -> Process next batch
        this.pollingInterval = setInterval(() => this.pollRoundRobin(), INGESTOR_CONFIG.POLLING_INTERVAL);
    }

    private async pollRoundRobin() {
        const assetIds = Array.from(this.marketCache.keys());
        if (assetIds.length === 0) return;

        // 1. Pick Batches
        const batchSize = INGESTOR_CONFIG.POLLING_BATCH_SIZE;
        if (this.currentAssetIndex >= assetIds.length) {
            this.currentAssetIndex = 0; // Reset loop
        }

        const batch = assetIds.slice(this.currentAssetIndex, this.currentAssetIndex + batchSize);
        this.currentAssetIndex += batchSize;

        // 2. Fetch Trades for Batch
        const promises = batch.map(assetId =>
            this.fetchTradesForAsset(assetId)
                .catch(e => console.warn(`⚠️ [Stream B] RR Fetch Error ${assetId}:`, e.message))
        );

        // [FIX] Wait for batch to complete to prevent runaway promises/rate-limit
        await Promise.allSettled(promises);
    }

    private async fetchTradesForAsset(assetId: string) {
        try {
            const response = await withRetry(
                () => axios.get(TRADE_API_URL, {
                    params: { asset_id: assetId, limit: INGESTOR_CONFIG.FETCH_TRADES_LIMIT, sort: 'timestamp' }
                }),
                `fetchTrades:${assetId.substring(0, 8)}`,
                { maxRetries: INGESTOR_CONFIG.MAX_RETRIES, baseDelayMs: INGESTOR_CONFIG.BASE_DELAY_MS }
            );

            const rawTrades = response.data;
            if (!Array.isArray(rawTrades)) return;

            // Validate and filter trades using Zod schema
            const validTrades: DataApiTrade[] = [];
            for (const raw of rawTrades) {
                const parsed = parseApiResponse(DataApiTradeSchema, raw, `trade:${assetId.substring(0, 8)}`);
                if (parsed) validTrades.push(parsed);
            }

            // Process Oldest -> Newest
            const sortedTrades = validTrades.reverse();

            for (const trade of sortedTrades) {
                try {
                    await this.processDetectiveTrade(trade);

                    // [FIX] Convert DataApiTrade to MarketTradeInput format
                    // onMarketTrade expects marketSlug, not slug
                    const marketTradeInput = {
                        marketSlug: trade.slug || trade.eventSlug,
                        outcome: trade.outcome,
                        price: trade.price,
                        side: trade.side,
                        actorAddress: trade.maker_address || trade.owner || trade.proxyWallet,
                        timestamp: trade.timestamp
                    };

                    // [LIVE MONITORING] Check TP/SL for open positions
                    await this.paperTradingService.onMarketTrade(marketTradeInput);
                } catch (tradeError: any) {
                    console.error(`❌ [Stream B] Trade Processing Error (${trade.id}):`, tradeError.message);
                }
            }
        } catch (e: any) {
            console.warn(`❌ [Stream B] Poll Fail ${assetId}: ${e.message}`);
        }
    }

    // =========================================================================
    // 🌍 AUTONOMOUS DISCOVERY
    // =========================================================================

    private async startAutoDiscovery() {
        const runDiscovery = async () => {
            console.log(`🔭 [Auto-Discovery] Scanning Top ${INGESTOR_CONFIG.DISCOVERY_MARKET_LIMIT} Active Markets...`);
            try {
                const response = await withRetry(
                    () => axios.get(GAMMA_URL, {
                        params: { active: true, closed: false, limit: INGESTOR_CONFIG.DISCOVERY_MARKET_LIMIT, sort: 'volume', ascending: false }
                    }),
                    'autoDiscovery',
                    { maxRetries: 2 }
                );

                const markets = response.data;
                if (!Array.isArray(markets)) return;

                console.log(`🔭 [Auto-Discovery] Found ${markets.length} markets. Ingesting...`);

                let newCount = 0;
                for (const m of markets) {
                    if (m.slug && !this.isTracking(m.slug)) {
                        await this.trackNewMarket(m.slug);
                        newCount++;
                        // Small delay to prevent burst on backfills?
                        // trackNewMarket already handles backfill logic (db check).
                        // If it's a huge surge, we might slow down.
                    } else if (m.slug) {
                        // Ensure cache is updated even if tracking
                        // trackNewMarket checks isTracking, but maybe we want to refresh metadata?
                        // For now, skip to save resources.
                    }
                }
                console.log(`✅ [Auto-Discovery] Complete. Added ${newCount} new markets.`);
            } catch (e: any) {
                console.error('❌ [Auto-Discovery] Error:', e.message);
            }
        };

        // Run immediately
        await runDiscovery();

        // Schedule at configured interval and save reference for cleanup
        this.discoveryInterval = setInterval(runDiscovery, INGESTOR_CONFIG.AUTO_DISCOVERY_INTERVAL);
    }

    private async processDetectiveTrade(trade: DataApiTrade) {

        const uniqueId = trade.id || trade.transactionHash || trade.match_id;
        if (!uniqueId || this.processedTradeIds.has(uniqueId)) return;

        // Filter: Must be worth analyzing
        const price = trade.price; // Already a number from Zod transform
        const size = trade.size;   // Already a number from Zod transform
        const volumeUSD = price * size;

        if (volumeUSD <= 0) return; // Filter noise (fixed: was < 0, should be <= 0)

        // ====================================================================
        // EARLY EXIT: Skip small trades to save API calls
        // We only do expensive analysis for trades >= MIN_TRADE_AMOUNT_USD
        // But we still record larger trades for whale discovery
        // ====================================================================
        const minForAnalysis = INGESTOR_CONFIG.MIN_TRADE_AMOUNT_USD; // 500
        const minForRecord = INGESTOR_CONFIG.MIN_SIGNAL_TRADE_AMOUNT; // 100

        if (volumeUSD < minForRecord) {
            return; // Skip entirely - too small to care
        }

        // Resolve Metadata
        const assetId = trade.asset_id || trade.asset;
        if (!assetId) {
            console.warn(`⚠️ [Stream B] No asset_id for trade ${uniqueId}`);
            return;
        }
        let metadata = this.marketCache.get(assetId);

        // [FIX] Trade API already returns slug, outcome, title, conditionId!
        // Use trade data directly as primary source
        let marketSlug = trade.slug || trade.eventSlug || 'pending_resolution';
        let conditionId = trade.conditionId || assetId;
        let outcome = trade.outcome || 'UNK';
        let title = trade.title || 'Unknown Market';

        // If we got data from trade, cache it for future use
        if (trade.slug && !metadata) {
            // [MEMORY PROTECTION] Check cache size before adding
            if (this.marketCache.size >= INGESTOR_CONFIG.MAX_MARKET_CACHE_SIZE) {
                // Remove oldest 20% of entries
                const entries = Array.from(this.marketCache.keys());
                const toDelete = entries.slice(0, Math.floor(entries.length * 0.2));
                toDelete.forEach(key => this.marketCache.delete(key));
                console.log(`🧹 [Ingestor] Pruned ${toDelete.length} old market cache entries (${this.marketCache.size} remaining)`);
            }

            this.marketCache.set(assetId, {
                slug: trade.slug,
                question: trade.title || '',
                conditionId: trade.conditionId || assetId,
                outcome: trade.outcome || 'UNK'
            });
            metadata = this.marketCache.get(assetId);
        }

        // Fallback: Lazy load only if trade didn't have slug
        if (marketSlug === 'pending_resolution' && !metadata) {
            console.log(`🔍 [Stream B] Unknown Asset ${assetId}, attempting lazy load...`);
            try {
                metadata = await this.fetchMarketDetails(assetId);
                if (metadata?.slug) {
                    marketSlug = metadata.slug;
                    conditionId = metadata.conditionId || assetId;
                    outcome = metadata.outcome || 'UNK';
                    title = metadata.question || title;
                }
            } catch (e: any) {
                console.error(`Failed to resolve market ${assetId}:`, e.message);
            }
        }

        // Mark as seen (We process EVERYTHING now)
        this.processedTradeIds.add(uniqueId);

        // [MEMORY PROTECTION] Prune old IDs when limit reached
        if (this.processedTradeIds.size > this.MAX_PROCESSED_IDS) {
            // Remove oldest 20% of entries
            const toDelete = Array.from(this.processedTradeIds).slice(0, Math.floor(this.MAX_PROCESSED_IDS * 0.2));
            toDelete.forEach(id => this.processedTradeIds.delete(id));
            console.log(`🧹 [Ingestor] Pruned ${toDelete.length} old trade IDs (${this.processedTradeIds.size} remaining)`);
        }

        // 1. Identify Actor (Taker / Aggressor)
        // API returns "owner" or "proxyWallet" which is the Taker.
        // Clarification: We are tracking the Active Trader, not the Passive Maker.
        let actorAddress = trade.maker_address || trade.owner || trade.proxyWallet;
        if (!actorAddress && trade.name) {
            // Sometimes name is the address if no alias?
            if (trade.name.startsWith('0x')) actorAddress = trade.name;
        }

        if (!actorAddress) {
            console.warn(`⚠️ No Actor Address for ${uniqueId}`);
            return;
        }

        // Check if this is a known Whale (from Seed DB)
        // Optimization: In real prod we'd cache whales, for now we query or just upsert
        // We actually want to CAPTURE anyone big, so let's check size first.

        let whaleAlias = null;
        let whaleTags = "";

        // Simple Tier Logic for "Unknown" Makers
        if (volumeUSD >= 50000) { whaleTags = "LEVIATHAN"; whaleAlias = "Unknown Leviathan"; }
        else if (volumeUSD >= 10000) { whaleTags = "SHARK"; whaleAlias = "Unknown Shark"; }
        else if (volumeUSD >= 1000) { whaleTags = "DOLPHIN"; }

        // If API provides real address, use it!
        // We will upsert the whale to ensure they strictly exist in our DB
        if (actorAddress) {
            const existingWhale = await prisma.whale.findUnique({ where: { address: actorAddress } });
            if (existingWhale) {
                whaleAlias = existingWhale.alias; // Use known alias
            } else {
                // New Whale Discovery
                if (volumeUSD > 1000) {
                    console.log(`🦈 [Stream B] New Whale Discovered: ${actorAddress} ($${volumeUSD.toFixed(0)})`);
                }
            }

            // 3. Strategy Evaluation
            // Prepare Signal Candidate
            const signalCandidate: SignalCandidate = {
                price: price,
                amountUSD: volumeUSD,
                marketSlug: marketSlug,
                category: metadata?.description, // Assuming description might contain category or we rely on slug/title
                title: title,
                outcome: outcome,
                expiryDate: metadata?.expiryDate,
                marketVolume: metadata?.volume
            };

            // We need the whale object with stats. We upserted it, so we should fetch it or use the values we have.
            // UPSERT does not return the full updated object in all Prisma versions? checks needed.
            // Actually, let's fetch it to be sure we have latest stats (winrate, pnl) if we want to trust the DB state.
            // `whale.upsert` returns the object!

            let whaleObj = await prisma.whale.upsert({
                where: { address: actorAddress || '0x000' },
                update: {
                    lastActive: new Date(),
                    volume: { increment: volumeUSD }
                },
                create: {
                    address: actorAddress || '0x000',
                    alias: whaleAlias,
                    volume: volumeUSD,
                    tags: whaleTags,
                    lastActive: new Date()
                }
            });

            // 3. Syndicate Tracking (Memory)
            if (marketSlug && actorAddress && outcome) {
                this.syndicateService.recordTrade(marketSlug, actorAddress, outcome);
            }

            // ================================================================
            // OPTIMIZATION: Skip expensive AI analysis for small trades
            // We still recorded the whale & syndicate above, but don't call APIs
            // ================================================================
            if (volumeUSD < minForAnalysis) {
                // Small trade - just record for whale tracking, no signal
                return;
            }

            // 2. AI Analysis (only for trades >= $500)
            const tradeData: TradeData = {
                amountUSD: volumeUSD,
                isNewMarket: false,
                price: price,
                side: (trade.side?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
                marketSlug: marketSlug,  // For kill switch filtering
                outcome: outcome         // For syndicate detection
            };

            // [FIX] Fetch total signal count for Freshness Check
            const totalTrades = await prisma.signal.count({
                where: { whaleAddress: actorAddress || '0x000' }
            });

            // Note: totalTrades is count of PREVIOUS signals + 0 (since current not created)
            // or should we include this one? Freshness usually means history.

            const aiScore = await this.analysisService.calculateScore(
                {
                    pnl: whaleObj.pnl,
                    winrate: whaleObj.winrate,
                    totalTrades: totalTrades
                },
                tradeData,
                actorAddress
            );
            const classification = this.analysisService.classifyTrade(tradeData);

            // [FIX] Persist whale score to database
            try {
                await prisma.whale.update({
                    where: { address: actorAddress },
                    data: {
                        score: aiScore,
                        lastAnalyzed: new Date()
                    }
                });
            } catch (scoreErr: any) {
                console.warn(`⚠️ Failed to update whale score for ${actorAddress}:`, scoreErr.message);
            }

            const strategyResult = this.strategyService.evaluate(signalCandidate, whaleObj);
            let betName = null;
            let betSize = 0;

            if (strategyResult.action === 'BET') {
                betName = strategyResult.strategy;

                // ================================================================
                // KELLY WIN PROBABILITY CALCULATION (Fixed!)
                // ================================================================
                // Market price = implied probability (60c = 60% chance)
                // AI Score = our confidence the whale is right (0-100)
                // 
                // If whale bets on outcome at price 0.40 (40% market odds):
                // - If we believe whale is right (aiScore=90), we think real prob > 40%
                // - Edge = (ourProb - marketProb) 
                // 
                // Simple approach: Blend market price with AI confidence boost
                // winProb = marketPrice + (1 - marketPrice) * (aiScore/100) * edgeFactor
                // 
                // More conservative: Use market price as base, boost by aiScore
                const marketImpliedProb = price; // 0.0 - 1.0
                const aiConfidence = aiScore / 100; // 0.0 - 1.0

                // Our estimated probability: market says X%, we think whale adds edge
                // If aiScore is 100, we believe there's a 20% edge over market
                // If aiScore is 50, minimal edge (5%)
                const maxEdge = 0.20; // Maximum 20% edge we believe exists
                const edgeBoost = aiConfidence * maxEdge;

                // winProb = min(0.95, marketProb + edge)
                const winProb = Math.min(0.95, marketImpliedProb + edgeBoost);

                // Odds for Kelly: If market price is 0.40, payout on win = 1/0.40 = 2.5x
                const odds = price > 0 ? (1 / price) : 0;

                betSize = this.riskService.calculateBetSize(
                    winProb,
                    odds,
                    metadata?.description || '',
                    marketSlug
                );

                console.log(`🎯 [Strategy] ${betName} triggered! Bet Size: $${betSize} (MarketProb: ${(marketImpliedProb * 100).toFixed(0)}% + Edge: ${(edgeBoost * 100).toFixed(0)}% = WinProb: ${(winProb * 100).toFixed(0)}%)`);
            }

            // ================================================================
            // [CRITICAL FIX] Skip signal creation if aiScore is 0
            // aiScore=0 means the trade was killed by filters (sports, hamster, etc.)
            // Don't pollute DB with zero-score signals
            // ================================================================
            if (aiScore === 0) {
                console.log(`⏭️ [Ingestor] Skipping signal: aiScore=0 (filtered) | ${marketSlug.substring(0, 40)}`);
                return;
            }

            // ================================================================
            // [CRITICAL FIX 2025-01-25] Skip HIGH PRICE signals
            // Problem: 66% of signals had price >= 0.85 → 91% loss rate!
            // Reason: At price 0.99, max ROI = +1%, but loss = -100%
            // This is MATHEMATICALLY IMPOSSIBLE to profit from.
            // Paper Trading already filters this, but signal pollutes DB & UI.
            // Uses centralized PRICE_CEILING from lib/constants.ts
            // ================================================================
            if (price >= PRICE_CEILING) {
                console.log(`⏭️ [Ingestor] HIGH PRICE KILL: ${price.toFixed(3)} >= ${PRICE_CEILING} | ${marketSlug.substring(0, 40)}`);
                return;
            }

            // ================================================================
            // [CRITICAL FIX 2025-01-26] Skip 15-min/5-min binary markets (updown)
            // Problem: These are short-term binary options, NOT real prediction markets.
            // Reality: 15-min BTC updown = gambling, not copy-tradeable.
            // - Latency 10-30s makes 15-min markets untradeable
            // - Whale can front-run, retail cannot
            // - 100% of recent "profitable" trades were on these garbage markets
            // ================================================================
            const isGamblingMarket = BANNED_MARKET_PATTERNS.some(pattern =>
                marketSlug.toLowerCase().includes(pattern)
            );
            if (isGamblingMarket) {
                console.log(`🚫 [Ingestor] GAMBLING MARKET KILL: ${marketSlug.substring(0, 50)} | Matches banned pattern`);
                return;
            }

            // Note: We do NOT mutate the trade object. Instead, we pass resolved metadata to PaperTradingService via onSignal.

            // Ensure conditionId is defined for signal creation
            const finalConditionId = conditionId || assetId;
            // assetId IS the tokenId (YES/NO token) for order book lookups
            const tokenId = assetId;

            let signal;
            try {
                signal = await prisma.signal.create({
                    data: {
                        txHash: uniqueId,
                        // [FIX] Timestamp magnitude check (seconds vs ms)
                        timestamp: new Date(Number(trade.timestamp) > 1e12
                            ? Number(trade.timestamp)
                            : Number(trade.timestamp) * 1000),
                        marketSlug: marketSlug,
                        conditionId: finalConditionId,
                        tokenId: tokenId,
                        outcome: outcome,
                        side: (trade.side || 'BUY').toUpperCase(),
                        price: price,
                        amountUSD: volumeUSD,
                        whaleAddress: actorAddress || '0x000',
                        status: 'OPEN',
                        aiScore: aiScore,
                        tags: classification,
                        strategyName: betName,
                        betAmount: betSize
                    }
                });
            } catch (err: any) {
                if (err.code === 'P2002') {
                    // Duplicate signal (Already processed) - Log and Continue
                    // We DO NOT return here if we want to ensure onSignal is called? 
                    // No, onSignal logic creates a NEW position. We don't want to double-create.
                    // But we DO want onMarketTrade (Price Update) to run, which is in the caller loop.
                    // So returning here is Safe for SIGNAL logic, but we must ensure trade object was updated above.
                    console.warn(`⚠️ [Ingestor] Duplicate Signal ignored: ${uniqueId}`);
                    return;
                }
                throw err; // Re-throw other errors
            }

            // [NEW] Paper Trading Trigger
            console.log('📨 [Ingestor] Forwarding signal to PaperService:', signal.marketSlug);
            this.paperTradingService.onSignal(signal).catch(e => console.error("PaperService Error:", e));

            // Re-query or just construct payload:
            // We need ID for DB entry.
            // Let's wait for create.
            // WARN: The previous code block didn't capture the result. I need to modify it.
        }
    }

    // =========================================================================
    // 🧠 SHARED: Metadata Cache (Gamma)
    // =========================================================================

    private async refreshMarketCache() {
        try {
            console.log('🔄 [Ingestor] Refreshing Gamma Cache...');
            const response = await withRetry(
                () => axios.get(GAMMA_URL, {
                    params: { active: true, closed: false, limit: 50, sort: 'volume', ascending: false }
                }),
                'refreshMarketCache',
                { maxRetries: 2 }
            );

            const markets = response.data;
            if (!Array.isArray(markets)) return;

            this.marketCache.clear();
            for (const m of markets) {
                this.processMarketData(m);
            }
            console.log(`✨ [Ingestor] Cache Warm: ${this.marketCache.size} assets tracked.`);

            // Re-subscribe Stream A if connected
            if (this.isConnected) {
                this.subscribeToTopMarkets();
            }

        } catch (e: any) {
            console.error('❌ [Ingestor] Cache Refresh Error:', e.message);
        }
    }

    // Helper to process a single market object from Gamma
    private processMarketData(m: any) {
        if (m.tokens && Array.isArray(m.tokens)) {
            // New "tokens" format (sometimes Gamma returns "tokens" array)
            for (const t of m.tokens) {
                if (t.token_id) {
                    this.marketCache.set(t.token_id, {
                        slug: m.slug,
                        question: m.question,
                        conditionId: m.conditionId,
                        outcome: t.outcome || 'UNK',
                        expiryDate: m.end_date_iso ? new Date(m.end_date_iso) : undefined,
                        volume: Number(m.volume || 0)
                    });
                }
            }
        }

        // Fallback or "clobTokenIds" format
        if (m.clobTokenIds) {
            const ids = (typeof m.clobTokenIds === 'string') ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;

            // [FIX] Try to resolve outcomes from m.outcomes
            let outcomes: string[] = [];
            if (m.outcomes) {
                try {
                    outcomes = (typeof m.outcomes === 'string') ? JSON.parse(m.outcomes) : m.outcomes;
                } catch (e) { /* ignore */ }
            }

            if (Array.isArray(ids) && ids.length > 0) {
                ids.forEach((assetId: string, index: number) => {
                    const mappedOutcome = outcomes[index] || 'UNK';

                    // [FIX] Overwrite if missing OR if current is UNK and new is valid
                    const existing = this.marketCache.get(assetId);
                    const shouldUpdate = !existing || (existing.outcome === 'UNK' && mappedOutcome !== 'UNK');

                    if (shouldUpdate) {
                        this.marketCache.set(assetId, {
                            slug: m.slug,
                            question: m.question,
                            conditionId: m.conditionId,
                            outcome: mappedOutcome,
                            expiryDate: m.end_date_iso ? new Date(m.end_date_iso) : undefined,
                            volume: Number(m.volume || 0)
                        });
                    }
                });
            }
        }
    }

    // =========================================================================
    // 🚀 ON-DEMAND TRACKING
    // =========================================================================

    public isTracking(slug: string): boolean {
        // Check if any asset in cache maps to this slug
        for (const val of this.marketCache.values()) {
            if (val.slug === slug) return true;
        }
        // [NEW] Event-level check
        // If the slug matches an Event, we might not have it as a direct key, 
        // but we might need to know if we track markets FOR this event?
        // Actually, if we track markets for an event, we don't store the event slug directly in the value object.
        // We only store the market `slug`.
        // So this check might return FALSE for an Event Slug, triggering `trackNewMarket`.
        // This is actually GOOD behavior (it triggers discovery).
        return false;
    }

    // [NEW] Helper to map Event Slug -> [Market Slug 1, Market Slug 2]
    public getRelatedSlugs(querySlug: string): string[] {
        const related: Set<string> = new Set();

        // 1. Exact Match (Direct Market)
        related.add(querySlug);

        // 2. Scan Cache for potential matches (Naive approach or need explicit mapping?)
        // The Cache stores { slug: "market-slug" }. It does NOT store "event-slug".
        // However, `trackNewMarket` fetches event markets. 
        // We need a way to store "Event -> Markets" mapping?
        // Or we just return all cached slugs that *contain* the query string? (Too loose).

        // BETTER: When `trackNewMarket` runs for an Event, it should store the Event->Market mapping.
        // But for now, let's just rely on the DB having data.

        // Wait, if we return [querySlug], and the DB has no rows for querySlug, but rows for related markets...
        // We need the method to return those related market slugs.

        // CRITICAL: We need to know which markets belong to this event.
        // We can't know this from `marketCache` easily unless `marketCache` stores `eventSlug`.
        // Gamma `processMarketData` receives `m`. Does `m` have `event_slug`? 
        // Let's check `processMarketData`. It doesn't seemingly use event slug.

        // HOTFIX: For now, we will return just the slug. 
        // BUT, we will update `trackNewMarket` to RETURN the list of discovered slugs.
        // Converting this function to just return `[querySlug]` is useless.
        // We need to change `index.ts` to query Gamma? No, too slow.

        // Let's rely on `Ingestor` having a new Map `eventMap: Map<string, string[]>` (Event -> MarketSlugs).
        return this.eventMap.get(querySlug) || [querySlug];
    }

    // [NEW] Map to track Event -> Markets relationships
    private eventMap: Map<string, string[]> = new Map();

    public async trackNewMarket(slug: string) {
        console.log(`🚀 [Ingestor] On-Demand Tracking Request: ${slug}`);

        try {
            // 1. Fetch Market/Event Details from Gamma
            // We'll try to find markets associated with this slug.
            // Note: Polymarket URLs usually are /event/slug. Gamma has /events?slug=...

            // Try Event Endpoint first (most common for "slugs" in URL)
            let marketsToTrack: any[] = [];
            let isEvent = false;

            try {
                const eventRes = await withRetry(
                    () => axios.get(`https://gamma-api.polymarket.com/events`, {
                        params: { slug: slug }
                    }),
                    `trackEvent:${slug}`,
                    { maxRetries: 2 }
                );

                if (Array.isArray(eventRes.data) && eventRes.data.length > 0) {
                    const event = eventRes.data[0];
                    if (event.markets && Array.isArray(event.markets)) {
                        marketsToTrack = event.markets;
                        isEvent = true;
                    }
                }
            } catch (e) {
                // If event fail, maybe it's a direct market slug?
                console.warn(`⚠️ [Ingestor] Event lookup failed for ${slug}, trying market...`);
            }

            // If no markets found via event, try direct market query
            if (marketsToTrack.length === 0) {
                const marketRes = await withRetry(
                    () => axios.get(GAMMA_URL, {
                        params: { slug: slug }
                    }),
                    `trackMarket:${slug}`,
                    { maxRetries: 2 }
                );
                if (Array.isArray(marketRes.data)) {
                    marketsToTrack = marketRes.data;
                } else if (marketRes.data) { // ID lookup?
                    marketsToTrack = [marketRes.data];
                }
            }

            if (marketsToTrack.length === 0) {
                console.warn(`❌ [Ingestor] Could not find any markets for slug: ${slug}`);
                return;
            }

            // 2. Add to Cache & Subscribe
            const newAssetIds: string[] = [];
            // [NEW] Collect market slugs for this event
            const discoveredMarketSlugs: Set<string> = new Set();

            for (const m of marketsToTrack) {
                // Determine Asset IDs (clobTokenIds or tokens)
                if (m.clobTokenIds) {
                    const ids = (typeof m.clobTokenIds === 'string') ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
                    if (Array.isArray(ids)) {
                        newAssetIds.push(...ids);
                    }
                }
                // Process Metadata
                this.processMarketData(m);
                if (m.slug) discoveredMarketSlugs.add(m.slug);
            }

            // [NEW] Update Event Map
            if (discoveredMarketSlugs.size > 0) {
                const existing = this.eventMap.get(slug) || [];
                // Merge and dedup
                const combined = Array.from(new Set([...existing, ...discoveredMarketSlugs]));
                this.eventMap.set(slug, combined);
                console.log(`🗺️ [Ingestor] Mapped '${slug}' (${isEvent ? 'Event' : 'Market'}) to ${combined.length} markets:`, combined);

                // [MEMORY PROTECTION] Prune eventMap if too large
                if (this.eventMap.size > this.MAX_EVENT_MAP_SIZE) {
                    const toDelete = Array.from(this.eventMap.keys()).slice(0, Math.floor(this.MAX_EVENT_MAP_SIZE * 0.2));
                    toDelete.forEach(key => this.eventMap.delete(key));
                    console.log(`🧹 [Ingestor] Pruned ${toDelete.length} old event mappings (${this.eventMap.size} remaining)`);
                }
            }

            // [NEW] Historical Backfill
            // Check if we already have sufficient data to skip backfill
            // Note: We should check count for ANY of the markets, or the event as a whole?
            // Let's check Total Count for all related markets.
            const allSlugs = Array.from(discoveredMarketSlugs);
            const count = allSlugs.length > 0 ? await prisma.signal.count({ where: { marketSlug: { in: allSlugs } } }) : 0;

            if (count < 50 && newAssetIds.length > 0) {
                console.log(`📜 [Ingestor] Backfilling History for ${slug} (Found ${count} signals, target 50+)...`);

                // Limit backfill to 2 assets max to avoid rate limits
                const assetsToBackfill = newAssetIds.slice(0, 2);

                for (const assetId of assetsToBackfill) {
                    try {
                        const historyRes = await withRetry(
                            () => axios.get(TRADE_API_URL, {
                                params: { asset_id: assetId, limit: 100, sort: 'timestamp' }
                            }),
                            `backfill:${assetId.substring(0, 8)}`,
                            { maxRetries: 2, baseDelayMs: 500 }
                        );

                        const trades = historyRes.data;
                        if (Array.isArray(trades)) {
                            // Process Oldest -> Newest
                            const sorted = trades.reverse();
                            console.log(`   Processing ${sorted.length} historical trades for asset ${assetId}...`);

                            for (const t of sorted) {
                                // Wrap to prevent full fail
                                try {
                                    await this.processDetectiveTrade(t);
                                } catch (err) { }
                            }
                        }
                    } catch (e: any) {
                        console.error(`   ❌ Backfill failed for ${assetId}: ${e.message}`);
                    }
                }
                console.log(`📜 [Ingestor] Backfill Complete.`);
            } else {
                console.log(`⏩ [Ingestor] Skipping Backfill (Data sufficient or no assets).`);
            }

            if (newAssetIds.length > 0) {
                // 3. Subscribe WebSocket (Pulse)
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ assets_ids: newAssetIds }));
                    console.log(`✅ [Ingestor] Subscribed to ${newAssetIds.length} new assets for ${slug}`);
                }

                // 4. Trigger Detective Scan immediately? 
                // We could, but the poller will catch them if they are active.
                // Or we can assume they are now in "marketCache" so the Detective *will* process them if they appear in trade streams.
            }

        } catch (e: any) {
            console.error(`❌ [Ingestor] Track New Market Error:`, e.message);
        }
    }

    private async fetchMarketDetails(assetId: string, retryCount = 0): Promise<MarketCache | undefined> {
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 1000;

        try {
            // The Gamma API doesn't support direct clob_token_id lookup.
            // Strategy: Fetch active markets (cached batch) and search for matching assetId
            // in their clobTokenIds array.

            console.log(`🔍 [Ingestor] Fetching market details for asset: ${assetId}`);

            // Fetch a batch of markets sorted by volume (most likely to contain active trades)
            // Use higher limit and include all markets (not just active) for better coverage
            const response = await axios.get(GAMMA_URL, {
                params: {
                    limit: 500,
                    sort: 'volume',
                    ascending: false
                },
                timeout: 15000
            });

            const markets = response.data;
            if (!Array.isArray(markets) || markets.length === 0) {
                console.warn(`⚠️ [Ingestor] No markets returned from Gamma API`);
                return undefined;
            }

            // Search through markets to find one containing this assetId
            for (const m of markets) {
                let clobIds: string[] = [];

                // Parse clobTokenIds (can be string or array)
                if (m.clobTokenIds) {
                    try {
                        clobIds = typeof m.clobTokenIds === 'string'
                            ? JSON.parse(m.clobTokenIds)
                            : m.clobTokenIds;
                    } catch { }
                }

                // Also check tokens array
                if (m.tokens && Array.isArray(m.tokens)) {
                    for (const t of m.tokens) {
                        if (t.token_id) clobIds.push(t.token_id);
                    }
                }

                // Check if our assetId is in this market
                if (clobIds.includes(assetId)) {
                    console.log(`✅ [Ingestor] Found market for ${assetId}: ${m.slug}`);
                    this.processMarketData(m); // Cache it!
                    return this.marketCache.get(assetId);
                }
            }

            console.warn(`⚠️ [Ingestor] Asset ${assetId} not found in top 100 markets`);
            return undefined;

        } catch (e: any) {
            // Handle rate limiting with exponential backoff
            if (e.response?.status === 429 && retryCount < MAX_RETRIES) {
                const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
                console.warn(`⚠️ [Ingestor] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.fetchMarketDetails(assetId, retryCount + 1);
            }

            console.error(`❌ [Ingestor] Lazy Load Failed for ${assetId}:`, e.message);
            return undefined;
        }
    }

    // =========================================================================
    // 🛑 GRACEFUL SHUTDOWN
    // =========================================================================

    /**
     * Gracefully stop all ingestor services
     * Call this on SIGTERM/SIGINT to prevent resource leaks
     */
    public async stop(): Promise<void> {
        if (this.isShuttingDown) {
            console.log('⚠️ [Ingestor] Already shutting down...');
            return;
        }

        this.isShuttingDown = true;
        console.log('🛑 [Ingestor] Graceful shutdown initiated...');

        // 1. Stop WebSocket
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.terminate();
            this.ws = null;
            console.log('✅ [Shutdown] WebSocket closed');
        }

        // 2. Clear all intervals
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
            console.log('✅ [Shutdown] Ping interval cleared');
        }

        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('✅ [Shutdown] Polling interval cleared');
        }

        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
            console.log('✅ [Shutdown] Discovery interval cleared');
        }

        // 3. Clear caches to free memory
        this.marketCache.clear();
        this.processedTradeIds.clear();
        this.eventMap.clear();

        this.isConnected = false;
        console.log('✅ [Ingestor] Graceful shutdown complete');
    }

    /**
     * Check if ingestor is shutting down (for loop guards)
     */
    public isShuttingDownStatus(): boolean {
        return this.isShuttingDown;
    }
}
