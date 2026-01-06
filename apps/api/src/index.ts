import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { PolymarketIngestor } from './ingestor'
import { config } from 'dotenv'
import { PrismaClient } from '@whalescope/db'
import { cors } from 'hono/cors'

config(); // Load env

const app = new Hono()
const prisma = new PrismaClient()

app.use('/*', cors({
  origin: (origin) => {
    return origin || '*'; // Reflect origin to support credentials
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Access-Control-Allow-Private-Network'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))

app.use('/*', async (c, next) => {
  c.header('Access-Control-Allow-Private-Network', 'true');
  await next();
})

import { ResolutionService } from './services/resolution.service';

// --- 1. Initialize Polymarket Ingestion ---
const ingestor = new PolymarketIngestor();
const resolver = new ResolutionService();

// Start Ingestion Service (Non-blocking)
ingestor.start().catch(err => {
  console.error("Failed to start ingestor:", err);
});

// Start Resolution Service (Loop every 10m)
setInterval(() => {
  resolver.resolveSignals().catch(err => console.error("Resolution Error:", err));
}, 10 * 60 * 1000); // 10 minutes

// Initial Run
resolver.resolveSignals().catch(err => console.error("Initial Resolution Error:", err));

// --- 2. API Routes ---
app.get('/', (c) => {
  return c.text('WhaleScope API & Streamer is Active 🐳')
})

app.get('/api/markets/:slug/sentiment', async (c) => {
  const slug = c.req.param('slug');

  try {
    // 1. Resolve Target Slugs (Event -> [Market1, Market2])
    let relatedSlugs = ingestor.getRelatedSlugs(slug);

    // [FIX] Sync Check: If single slug (unmapped), force track to discover potential children
    if (relatedSlugs.length === 1 && relatedSlugs[0] === slug) {
      if (!ingestor.isTracking(slug)) {
        await ingestor.trackNewMarket(slug).catch(e => console.error("Tracking Error", e));
        // Re-fetch after tracking
        relatedSlugs = ingestor.getRelatedSlugs(slug);
      }
    }

    // [NEW] On-Demand Tracking Check
    if (!ingestor.isTracking(slug)) {
      // Trigger Discovery & Backfill
      // logical race condition: trackNewMarket is async.
      // We will kick it off. The first request might still be empty or partial.
      // But the map will update for subsequent requests (poll interval 1s).
      await ingestor.trackNewMarket(slug).catch(e => console.error("Tracking Error", e));

      // Refresh related slugs after tracking (if possible)
      relatedSlugs = ingestor.getRelatedSlugs(slug);
    }

    // Safety: Ensure we have at least the requested slug to avoid empty IN clause
    if (relatedSlugs.length === 0) relatedSlugs = [slug];

    // Optimized: Fetch ALL signals once and aggregate in memory
    const signals = await prisma.signal.findMany({
      where: { marketSlug: { in: relatedSlugs } },
      select: { amountUSD: true, side: true, outcome: true, whaleAddress: true }
    });

    const result = {
      market: slug,
      bullishVolume: 0,
      bearishVolume: 0,
      neutralVolume: 0,
      whaleCount: 0,
      activeWhales: [] as any[],
      latestAiScore: 0,
      latestPattern: "",
      latestSide: "N/A",
      latestOutcome: "N/A",
      lastTradeTime: null as any,
      history: [] as any[]
    };

    const whalesSet = new Set<string>();

    for (const s of signals) {
      const outcome = s.outcome || 'UNK';

      // Volume Logic
      if (s.outcome === 'Yes') {
        if (s.side === 'BUY') result.bullishVolume += s.amountUSD;
        else result.bearishVolume += s.amountUSD;
      } else if (s.outcome === 'No') {
        if (s.side === 'BUY') result.bearishVolume += s.amountUSD;
        else result.bullishVolume += s.amountUSD;
      } else {
        // UNK / Pending -> Neutral
        result.neutralVolume += s.amountUSD;
      }

      whalesSet.add(s.whaleAddress);
    }
    result.whaleCount = whalesSet.size;

    // Get Latest Signal for AI Context
    const latestSignal = await prisma.signal.findFirst({
      where: { marketSlug: { in: relatedSlugs } },
      orderBy: { timestamp: 'desc' }
    });

    // [NEW] History for Sparkline
    const historySignals = await prisma.signal.findMany({
      where: { marketSlug: { in: relatedSlugs } },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: {
        timestamp: true,
        aiScore: true,
        price: true,
        side: true
      }
    });

    // Sort ASC for Chart
    const history = historySignals.reverse().map(h => ({
      time: h.timestamp.toISOString(),
      score: h.aiScore,
      price: h.price
    }));

    // [NEW] Top 5 Active Whales (The Roster)
    const topWhalesGroup = await prisma.signal.groupBy({
      by: ['whaleAddress'],
      where: { marketSlug: { in: relatedSlugs } },
      _sum: { amountUSD: true },
      orderBy: { _sum: { amountUSD: 'desc' } },
      take: 5
    });

    // Fetch aliases for these whales
    const activeWhales = await Promise.all(topWhalesGroup.map(async (w) => {
      const whaleInfo = await prisma.whale.findUnique({
        where: { address: w.whaleAddress },
        select: { alias: true, winrate: true }
      });
      return {
        address: w.whaleAddress,
        alias: whaleInfo?.alias || 'Unknown',
        volume: w._sum.amountUSD || 0,
        winrate: whaleInfo?.winrate || 0
      };
    }));

    result.latestAiScore = (latestSignal as any)?.aiScore || 0;
    result.latestPattern = (latestSignal as any)?.tags || '';
    result.latestSide = latestSignal?.side || "N/A";
    result.latestOutcome = latestSignal?.outcome || "N/A";
    result.lastTradeTime = latestSignal?.timestamp ? latestSignal.timestamp.toISOString() : null;

    return c.json({
      market: result.market,
      bullishVolume: result.bullishVolume,
      bearishVolume: result.bearishVolume,
      neutralVolume: result.neutralVolume,
      whaleCount: result.whaleCount,
      latestAiScore: result.latestAiScore,
      latestPattern: result.latestPattern,
      latestSide: result.latestSide,
      latestOutcome: result.latestOutcome,
      lastTradeTime: result.lastTradeTime,
      history: result.history,
      activeWhales: result.activeWhales
    });
  } catch (e: any) {
    console.error("API Error detailed:", e);
    return c.json({
      error: "Failed to fetch sentiment",
      details: e.message,
      stack: e.stack
    }, 500);
  }
});

app.get('/api/whales/leaderboard', async (c) => {
  try {
    const whales = await prisma.whale.findMany({
      take: 20,
      where: {
        lastActive: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Active in last 24h
        },
        volume: { gt: 0 }
      },
      orderBy: { volume: 'desc' },
      select: {
        address: true,
        alias: true,
        volume: true,
        pnl: true,
        winrate: true,
        tags: true,
        lastActive: true
      }
    });
    return c.json(whales);
  } catch (e) {
    console.error("API Error:", e);
    return c.json({ error: "Failed to fetch leaderboard" }, 500);
  }
});

// [NEW] Alpha Signal Feed (Shadow Whale Activity)
app.get('/api/signals/feed', async (c) => {
  try {
    const signals = await prisma.signal.findMany({
      take: 50,
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        timestamp: true,
        marketSlug: true,
        side: true,
        amountUSD: true,
        aiScore: true,
        tags: true,
        whaleAddress: true, // Shows "0xSHADOW...LEVIATHAN"
        whale: {
          select: { alias: true } // "Anonymous Leviathan"
        }
      }
    });
    return c.json(signals);
  } catch (e) {
    console.error("API Error:", e);
    return c.json({ error: "Failed to fetch signals" }, 500);
  }
});

const port = 3001
console.log(`Server is running on port ${port}`)

const server = serve({
  fetch: app.fetch,
  port
})

// --- 3. Frontend WebSocket (Social Stream) ---
const wss = new WebSocketServer({ server: server as any })

function broadcastToClients(data: any) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Frontend Client connected')
  ws.send(JSON.stringify({ type: 'WELCOME', message: 'Connected to WhaleScope Stream' }))
})
