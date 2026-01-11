import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { PolymarketIngestor } from './ingestor'
import { config } from 'dotenv'
import { prisma } from '@whalescope/db'
import { cors } from 'hono/cors'
import { fundingService } from './services/funding.service'

config(); // Load env

// ============================================================================
// ENVIRONMENT VALIDATION - Fail fast if required vars are missing
// ============================================================================
const REQUIRED_ENV_VARS = ['DATABASE_URL'] as const;
const OPTIONAL_ENV_VARS = ['ALCHEMY_API_KEY', 'PORT'] as const;

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`❌ FATAL: Required environment variable ${envVar} is not set`);
    process.exit(1);
  }
}

for (const envVar of OPTIONAL_ENV_VARS) {
  if (!process.env[envVar]) {
    console.warn(`⚠️  Optional environment variable ${envVar} is not set`);
  }
}

const app = new Hono()

// ============================================================================
// RATE LIMITING - Prevent abuse (in-memory, simple)
// ============================================================================
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per IP

app.use('/*', async (c, next) => {
  const clientIP = c.req.header('x-forwarded-for')?.split(',')[0] || 'unknown';
  const now = Date.now();
  
  let entry = rateLimitMap.get(clientIP);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(clientIP, entry);
  }
  
  entry.count++;
  
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }
  
  await next();
});

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

app.use('/*', cors({
  origin: (origin) => {
    // Allow Polymarket and our API domains
    const allowedOrigins = [
      'https://polymarket.com',
      'https://www.polymarket.com',
      'https://api.whalescope.io',
      process.env.API_ORIGIN // Allow custom origin from env
    ].filter(Boolean);
    // Allow if origin is in allowedOrigins, or reflect for extensions
    if (!origin || allowedOrigins.includes(origin)) return origin || '*';
    return origin; // Reflect for Chrome extension localhost
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

import { strategies } from './routes/strategies';
app.route('/api/strategies', strategies);


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

// Health check endpoint for load balancers
app.get('/health', async (c) => {
  const checks = {
    api: 'ok',
    database: 'unknown',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  };

  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'error';
  }

  const isHealthy = checks.api === 'ok' && checks.database === 'ok';
  
  return c.json({
    status: isHealthy ? 'healthy' : 'degraded',
    checks,
  }, isHealthy ? 200 : 503);
})

// Input validation regex for slugs (alphanumeric, dashes, underscores)
const SLUG_REGEX = /^[a-zA-Z0-9_-]{1,200}$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function validateSlug(slug: string | undefined): string | null {
  if (!slug || !SLUG_REGEX.test(slug)) return null;
  return slug;
}

function validateAddress(address: string | undefined): string | null {
  if (!address || !ADDRESS_REGEX.test(address)) return null;
  return address.toLowerCase();
}

app.get('/api/markets/:slug/sentiment', async (c) => {
  const rawSlug = c.req.param('slug');
  const slug = validateSlug(rawSlug);
  
  if (!slug) {
    return c.json({ error: 'Invalid slug format', code: 'INVALID_SLUG' }, 400);
  }

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

    const result: {
      market: string;
      bullishVolume: number;
      bearishVolume: number;
      neutralVolume: number;
      whaleCount: number;
      activeWhales: { address: string; alias: string; volume: number; winrate: number }[];
      latestAiScore: number;
      latestPattern: string;
      latestSide: string;
      latestOutcome: string;
      lastTradeTime: string | null;
      history: { time: string; score: number; side: string }[];
    } = {
      market: slug,
      bullishVolume: 0,
      bearishVolume: 0,
      neutralVolume: 0,
      whaleCount: 0,
      activeWhales: [],
      latestAiScore: 0,
      latestPattern: "",
      latestSide: "N/A",
      latestOutcome: "N/A",
      lastTradeTime: null,
      history: []
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
    const history = historySignals.reverse().map((h) => ({
      time: h.timestamp.toISOString(),
      score: h.aiScore || 0,
      side: h.side
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

    result.latestAiScore = latestSignal?.aiScore || 0;
    result.latestPattern = latestSignal?.tags || '';
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
    console.error("API Error detailed:", e); // Full error logged server-side only
    return c.json({
      error: "Failed to fetch sentiment",
      code: "SENTIMENT_ERROR"
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
        outcome: true,       // [NEW] Full outcome text
        side: true,
        amountUSD: true,
        aiScore: true,
        tags: true,
        whaleAddress: true,
        whale: {
          select: { 
            alias: true,
            tags: true,           // [NEW] Whale tags for rank icons
            winrate: true,        // [NEW] For fresh wallet detection
            pnl: true,            // [NEW] For rank context
            fundingSourceTag: true // [NEW] Source of funds tag
          }
        }
      }
    });
    return c.json(signals);
  } catch (e) {
    console.error("API Error:", e);
    return c.json({ error: "Failed to fetch signals" }, 500);
  }
});

// ============================================================================
// [NEW] Whale Dossier Lookup - GET /api/whales/:address
// ============================================================================
app.get('/api/whales/:address', async (c) => {
  const rawAddress = c.req.param('address');
  const address = validateAddress(rawAddress);

  if (!address) {
    return c.json({ error: 'Invalid Ethereum address format', code: 'INVALID_ADDRESS' }, 400);
  }

  try {
    // 1. Look up whale in DB with signals for stats calculation
    let whale = await prisma.whale.findUnique({
      where: { address },
      select: {
        address: true,
        alias: true,
        tags: true,
        winrate: true,
        pnl: true,
        volume: true,
        score: true,
        lastActive: true,
        lastAnalyzed: true,
        fundingSource: true,
        fundingSourceTag: true,
        fundingAnalyzedAt: true,
      }
    });

    // 2. If whale doesn't exist, create minimal entry
    if (!whale) {
      whale = await prisma.whale.create({
        data: { 
          address,
          winrate: 0,
          pnl: 0,
          volume: 0,
          score: 0,
        },
        select: {
          address: true,
          alias: true,
          tags: true,
          winrate: true,
          pnl: true,
          volume: true,
          score: true,
          lastActive: true,
          lastAnalyzed: true,
          fundingSource: true,
          fundingSourceTag: true,
          fundingAnalyzedAt: true,
        }
      });
    }

    // 3. Calculate stats from signals
    const signalStats = await prisma.signal.groupBy({
      by: ['whaleAddress'],
      where: { whaleAddress: address },
      _count: { id: true },
    });
    
    const wonCount = await prisma.signal.count({
      where: { whaleAddress: address, status: 'WON' }
    });
    
    const lostCount = await prisma.signal.count({
      where: { whaleAddress: address, status: 'LOST' }
    });
    
    const totalTrades = signalStats[0]?._count?.id || 0;
    const closedTrades = wonCount + lostCount;

    // 4. Trigger funding analysis if not analyzed yet
    if (!whale.fundingAnalyzedAt) {
      try {
        await fundingService.analyzeFunding(address);
        
        // Refresh whale data after analysis
        whale = await prisma.whale.findUnique({
          where: { address },
          select: {
            address: true,
            alias: true,
            tags: true,
            winrate: true,
            pnl: true,
            volume: true,
            score: true,
            lastActive: true,
            lastAnalyzed: true,
            fundingSource: true,
            fundingSourceTag: true,
            fundingAnalyzedAt: true,
          }
        });
      } catch (e) {
        console.warn(`[Whale API] Funding analysis failed for ${address}:`, e);
      }
    }

    // 5. Calculate winrate from actual closed signals
    const winratePercent = closedTrades > 0 ? ((wonCount / closedTrades) * 100).toFixed(1) : '0.0';
    
    // 6. Determine risk level
    let riskLevel = 'UNKNOWN';
    if (whale!.fundingSourceTag === 'SUSPICIOUS_INSIDER') {
      riskLevel = 'HIGH_RISK';
    } else if (whale!.fundingSourceTag === 'RETAIL') {
      riskLevel = 'LOW_RISK';
    } else if (whale!.fundingSourceTag === 'BRIDGE') {
      riskLevel = 'MEDIUM_RISK';
    }

    // 7. Build dossier response
    const dossier = {
      // Identity
      address: whale!.address,
      alias: whale!.alias,
      
      // Tags & Classification
      tags: whale!.tags?.split(',').filter(Boolean) || [],
      riskLevel,
      
      // Funding Intel
      funding: {
        source: whale!.fundingSource,
        tag: whale!.fundingSourceTag || 'UNKNOWN',
        analyzedAt: whale!.fundingAnalyzedAt,
        icon: whale!.fundingSourceTag === 'SUSPICIOUS_INSIDER' ? '🌪️' :
              whale!.fundingSourceTag === 'RETAIL' ? '🏦' :
              whale!.fundingSourceTag === 'BRIDGE' ? '🌉' :
              whale!.fundingSourceTag === 'WHALE' ? '💎' : '❓',
      },
      
      // Performance Stats (use stored values from whale analysis, fallback to calculated)
      stats: {
        totalTrades,
        wins: wonCount,
        losses: lostCount,
        winrate: whale!.winrate || parseFloat(winratePercent),
        pnl: whale!.pnl || 0,
        volume: whale!.volume || 0,
        score: whale!.score || 0,
        lastActive: whale!.lastActive,
      },
      
      // Meta
      _analyzed: !!whale!.fundingAnalyzedAt,
      _timestamp: new Date().toISOString(),
    };

    return c.json(dossier);

  } catch (e: any) {
    console.error("[Whale API] Error:", e);
    return c.json({ error: e.message || 'Failed to fetch whale data' }, 500);
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

// ============================================================================
// GRACEFUL SHUTDOWN - Clean up resources on process termination
// ============================================================================
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Stop ingestor (WebSocket, intervals, caches)
    await ingestor.stop();
    
    // Stop FundingService cleanup interval
    fundingService.destroy();
    
    // Close WebSocket server
    wss.clients.forEach(client => client.terminate());
    wss.close();
    
    // Close database connections
    await prisma.$disconnect();
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error during shutdown:', e);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
