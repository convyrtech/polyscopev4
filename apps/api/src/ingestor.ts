import WebSocket from 'ws';
import axios from 'axios';
import { PrismaClient } from '@whalescope/db';
import { AnalysisService, TradeData } from './services/analysis.service';
import { StrategyService, StrategyType, SignalCandidate } from './services/strategy.service';
import { RiskService } from './services/risk.service';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const GAMMA_URL = 'https://gamma-api.polymarket.com/markets';
const TRADE_API_URL = 'https://data-api.polymarket.com/trades';

const prisma = new PrismaClient();

// Cache to store slug/question for incoming asset IDs
interface MarketCache {
    slug: string;
    question: string;
    conditionId: string;
    description?: string;
    tokens?: any[]; // raw tokens data
    outcome?: string; // "Yes", "No", etc.
    // [NEW] Venezuela Protocol Metadata
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
    private currentAssetIndex = 0; // [NEW] For Round Robin

    // --- SERVICES ---
    private analysisService = new AnalysisService();
    private strategyService = new StrategyService();
    private riskService = new RiskService();

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

                // Broadcast Pulse (Log for now, could be socket.emit)
                const events = Array.isArray(message) ? message : [message];
                for (const e of events) {
                    if (e.event_type === 'last_trade_price' || e.event_type === 'trade') {
                        // Just log activity to show "Life"
                        // console.log(`⚡ [Pulse] ${e.side} ${e.size} shares on ${e.asset_id}`); 
                    }
                }
            } catch (error) {
                // Ignore parsing errors for pulse
            }
        });

        this.ws.on('close', () => {
            // console.log('❌ [Stream A] WS Closed. Reconnecting...');
            setTimeout(() => this.connectWs(), 5000);
        });

        this.ws.on('error', (err) => console.error('❌ [Stream A] WS Error:', err.message));
    }

    private startPing() {
        setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 20000);
    }

    private async subscribeToTopMarkets() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Get Asset IDs from Cache
        const assetIds = Array.from(this.marketCache.keys());
        if (assetIds.length === 0) return;

        const chunk = assetIds.slice(0, 20); // Subscribe to top 20 for Pulse
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
        // Tick every 200ms -> Process next batch
        // 5 requests / sec
        this.pollingInterval = setInterval(() => this.pollRoundRobin(), 200);
    }

    private async pollRoundRobin() {
        const assetIds = Array.from(this.marketCache.keys());
        if (assetIds.length === 0) return;

        // 1. Pick Batches
        const batchSize = 2; // Fetch 2 assets per tick
        if (this.currentAssetIndex >= assetIds.length) {
            this.currentAssetIndex = 0; // Reset loop
        }

        const batch = assetIds.slice(this.currentAssetIndex, this.currentAssetIndex + batchSize);
        this.currentAssetIndex += batchSize;

        // 2. Fetch Trades for Batch
        for (const assetId of batch) {
            // Run in "parallel" but handled in loop to avoid complex Promise.all error handling per item
            // Actually Promise.allSettled is better but keeping simple for now.
            // Just fire and forget? No, we await to respect rate limits implicity by single threaded loop time?
            // No, the setInterval calls this asyncronously.
            // We just trigger the fetch.
            this.fetchTradesForAsset(assetId).catch(e => console.warn(`RR Fetch Error ${assetId}:`, e.message));
        }
    }

    private async fetchTradesForAsset(assetId: string) {
        try {
            const response = await axios.get(TRADE_API_URL, {
                params: { asset_id: assetId, limit: 10, sort: 'timestamp' } // Small limit for frequent polling
            });

            const trades = response.data;
            if (!Array.isArray(trades)) return;

            // Process Oldest -> Newest
            const sortedTrades = trades.reverse();

            for (const trade of sortedTrades) {
                try {
                    await this.processDetectiveTrade(trade);
                } catch (tradeError) { /* ignore */ }
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
            console.log('🔭 [Auto-Discovery] Scanning Top 50 Active Markets...');
            try {
                const response = await axios.get(GAMMA_URL, {
                    params: { active: true, closed: false, limit: 50, sort: 'volume', ascending: false }
                });

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

        // Schedule every 10 minutes
        setInterval(runDiscovery, 10 * 60 * 1000);
    }

    private async processDetectiveTrade(trade: any) {

        const uniqueId = trade.id || trade.transactionHash || trade.match_id;
        if (!uniqueId || this.processedTradeIds.has(uniqueId)) return;

        // Mark as seen
        this.processedTradeIds.add(uniqueId);

        // [MEMORY PROTECTION] Garbage Collection
        // Prevent memory leak on small VPS (1GB RAM)
        if (this.processedTradeIds.size > 50000) {
            // Clear entire set every ~50k trades. 
            // Better strategy: delete oldest? Set handles insertion order.
            // For simplicity and perf: clear half or just clear all occasionally.
            // Clearing all risks duplicates for a split second, but safe enough.
            this.processedTradeIds.clear();
            this.processedTradeIds.add(uniqueId);
        }

        // Filter: Must be worth analyzing
        const price = Number(trade.price);
        const size = Number(trade.size);
        const volumeUSD = price * size;

        if (volumeUSD < 0) return; // Filter noise (Lowered to $0 for verification)
        console.log(`🕵️ [Debug] Valid Trade: ${volumeUSD.toFixed(1)} on ${trade.asset}`);

        // Resolve Metadata
        const assetId = trade.asset_id || trade.asset; // Handle both
        let metadata = this.marketCache.get(assetId);

        // FIX 3: Lazy Load if missing
        if (!metadata) {
            console.warn(`⚠️ Metadata Miss for ${assetId} (Cache Size: ${this.marketCache.size})`);
            console.log(`🔍 [Stream B] Unknown Asset ${assetId}, attempting lazy load...`);
            try {
                metadata = await this.fetchMarketDetails(assetId);
            } catch (e) { console.error("Lazy Load Failed", e); return; }
        }

        // If still missing even after lazy load, fallback (but should be rare now)
        const marketSlug = metadata?.slug || 'unknown-market';
        const conditionId = metadata?.conditionId || assetId;
        const outcome = metadata?.outcome || 'UNK'; // FIX 2: Use cached outcome

        // 1. Identify Maker
        // API returns "owner" or "proxyWallet" sometimes? 
        // Let's fallback aggressively.
        let makerAddr = trade.maker_address || trade.owner || trade.proxyWallet;
        if (!makerAddr && trade.name) {
            // Sometimes name is the address if no alias?
            if (trade.name.startsWith('0x')) makerAddr = trade.name;
        }

        if (!makerAddr) {
            console.warn(`⚠️ No Maker Address for ${uniqueId}`);
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
        if (makerAddr) {
            const existingWhale = await prisma.whale.findUnique({ where: { address: makerAddr } });
            if (existingWhale) {
                whaleAlias = existingWhale.alias; // Use known alias
            } else {
                // New Whale Discovery
                if (volumeUSD > 1000) {
                    console.log(`🦈 [Stream B] New Whale Discovered: ${makerAddr} ($${volumeUSD.toFixed(0)})`);
                }
            }

            // 3. Strategy Evaluation
            // Prepare Signal Candidate
            const signalCandidate: SignalCandidate = {
                price: price,
                amountUSD: volumeUSD,
                marketSlug: marketSlug,
                category: metadata?.description, // Assuming description might contain category or we rely on slug/title
                title: metadata?.question,
                outcome: outcome,
                expiryDate: metadata?.expiryDate,
                marketVolume: metadata?.volume
            };

            // We need the whale object with stats. We upserted it, so we should fetch it or use the values we have.
            // UPSERT does not return the full updated object in all Prisma versions? checks needed.
            // Actually, let's fetch it to be sure we have latest stats (winrate, pnl) if we want to trust the DB state.
            // `whale.upsert` returns the object!

            let whaleObj = await prisma.whale.upsert({
                where: { address: makerAddr || '0x000' },
                update: {
                    lastActive: new Date(),
                    volume: { increment: volumeUSD }
                },
                create: {
                    address: makerAddr || '0x000',
                    alias: whaleAlias,
                    volume: volumeUSD,
                    tags: whaleTags,
                    lastActive: new Date()
                }
            });

            // 2. AI Analysis
            const tradeData: TradeData = {
                amountUSD: volumeUSD,
                isNewMarket: false,
                price: price,
                side: trade.side || 'BUY'
            };
            // Note: passing dummy whale stats for now as AnalysisService handles trade-specific scoring? 
            // Or should we pass real whale stats? Existing code passed {pnl:0...}
            const aiScore = this.analysisService.calculateScore({ pnl: 0, winrate: 0, totalTrades: 0 }, tradeData);
            const classification = this.analysisService.classifyTrade(tradeData);

            const strategyResult = this.strategyService.evaluate(signalCandidate, whaleObj);
            let betName = null;
            let betSize = 0;

            if (strategyResult.action === 'BET') {
                betName = strategyResult.strategy;
                // Calculate Risk
                // Need win probability. Usage of aiScore / 100? Or implied prob from price?
                // "Quarter Kelly": we need estimated win probability.
                // If we use `aiScore`, let's assume aiScore (0-100) -> 0.0 to 1.0 prob?
                // Or use price as implied prob (no edge)?
                // The prompt doesn't specify where `winProb` comes from for Kelly.
                // "Step 3 ... Return { strategy ... action ... confidence }".
                // Let's use `strategyResult.confidence` as the Win Probability?
                // Use confidence as win probability proxy
                const winProb = strategyResult.confidence || (aiScore / 100);
                const odds = price > 0 ? (1 / price) : 0;

                betSize = this.riskService.calculateBetSize(
                    winProb,
                    odds,
                    metadata?.description || '',
                    marketSlug
                );

                console.log(`🎯 [Strategy] ${betName} triggered! Bet Size: $${betSize} (Conf: ${winProb.toFixed(2)})`);
            }

            // 4. Save Signal
            console.log(`✅ [Stream B] Signal: ${trade.side} ${outcome} ($${volumeUSD.toFixed(0)}) on ${metadata?.question || assetId} [${makerAddr?.slice(0, 6)}...]`);

            await prisma.signal.create({
                data: {
                    txHash: uniqueId,
                    timestamp: new Date(Number(trade.timestamp) * 1000),
                    marketSlug: marketSlug,
                    conditionId: conditionId,
                    outcome: outcome,
                    side: trade.side.toUpperCase(),
                    price: price,
                    amountUSD: volumeUSD,
                    whaleAddress: makerAddr || '0x000',
                    status: 'OPEN',
                    aiScore: aiScore,
                    tags: classification,
                    strategyName: betName,
                    betAmount: betSize
                }
            });
        }
    }

    // =========================================================================
    // 🧠 SHARED: Metadata Cache (Gamma)
    // =========================================================================

    private async refreshMarketCache() {
        try {
            console.log('🔄 [Ingestor] Refreshing Gamma Cache...');
            const response = await axios.get(GAMMA_URL, {
                params: { active: true, closed: false, limit: 50, sort: 'volume', ascending: false }
            });

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

        } catch (e) {
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
            if (Array.isArray(ids) && ids.length > 0) {
                // Try to map tokens if they exist in `tokens` array
                // If not, we have to guess or wait. 
                // Usually for Yes/No, index 0 is Long (Yes)? No, actually depends on market type.
                // Let's rely on the 'tokens' array if present for outcome mapping.

                // If we have parsed tokens previously in `processMarketData` via `tokens` we are good.
                // But valid markets *should* have `tokens` array. 

                // If we ONLY have ids, we might leave outcome UNK, but usually `tokens` is better.
                // For safety alongside refresh:
                ids.forEach((assetId: string) => {
                    // Only set if not already set by better logic
                    if (!this.marketCache.has(assetId)) {
                        this.marketCache.set(assetId, {
                            slug: m.slug,
                            question: m.question,
                            conditionId: m.conditionId,
                            conditionId: m.conditionId,
                            outcome: 'UNK', // Pending better mapping
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

            try {
                const eventRes = await axios.get(`https://gamma-api.polymarket.com/events`, {
                    params: { slug: slug }
                });

                if (Array.isArray(eventRes.data) && eventRes.data.length > 0) {
                    const event = eventRes.data[0];
                    if (event.markets && Array.isArray(event.markets)) {
                        marketsToTrack = event.markets;
                    }
                }
            } catch (e) {
                // If event fail, maybe it's a direct market slug?
                console.warn(`⚠️ [Ingestor] Event lookup failed for ${slug}, trying market...`);
            }

            // If no markets found via event, try direct market query
            if (marketsToTrack.length === 0) {
                const marketRes = await axios.get(GAMMA_URL, {
                    params: { slug: slug } // specific market slug
                });
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
                console.log(`🗺️ [Ingestor] Mapped Event '${slug}' to ${combined.length} markets.`);
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
                        const historyRes = await axios.get(TRADE_API_URL, {
                            params: { asset_id: assetId, limit: 100, sort: 'timestamp' } // descending usually? Need oldest first? 
                            // API default is likely newest first if not specified, but let's check docs. 
                            // Usually we want 'timestamp' asc? 
                            // Actually, simpler: fetch default (newest), then reverse array.
                        });

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

        } catch (e) {
            console.error(`❌ [Ingestor] Track New Market Error:`, e.message);
        }
    }

    private async fetchMarketDetails(assetId: string): Promise<MarketCache | undefined> {
        try {
            // We can query Gamma by market ID? Or just list and filter?
            // Gamma doesn't have a direct "get market by asset ID" endpoint easily documented here?
            // Usually we search by slug or ID. 
            // Workaround: We query the specific market endpoint if we knew the market ID.
            // But we only have assetId. 
            // Let's try to query /markets with nested params if possible, or search?
            // Actually, the user asked to "Fetch the single market".
            // We can assume we might need to search or just GET /markets/{id} if we can derive it.
            // Since we don't have the market ID, we might have to skip or do a broader search?

            // Wait, for Poly, we can look up by token_id?
            // Let's try querying `clobTokenIds`?
            // The Gamma API supports `id` (marketID).

            // Let's try a direct look up if possible. If not, maybe just `markets?clob_token_id=${assetId}`?
            // Let's assume there is a query param for that. 
            // If not, we fall back to a wide search.

            // A better approach for now: Query "markets" with no limit effectively? No that's too heavy.
            // Let's try the `id` param if we can't find it.

            // Actually, let's use the provided endpoint and hope for a filter.
            // `https://gamma-api.polymarket.com/markets?clob_token_id=...`

            const response = await axios.get(GAMMA_URL, {
                params: { clob_token_id: assetId }
            });

            const data = response.data;
            // Response might be a list or single object
            const markets = Array.isArray(data) ? data : [data];

            if (markets.length > 0) {
                const m = markets[0];
                this.processMarketData(m); // Cache it!
                return this.marketCache.get(assetId);
            }

            return undefined;

        } catch (e) {
            console.warn(`⚠️ [Ingestor] Lazy Load Failed for ${assetId}: ${e.message}`);
            return undefined;
        }
    }
}
