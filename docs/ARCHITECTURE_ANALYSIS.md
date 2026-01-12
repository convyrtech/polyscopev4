# 🐳 WhaleScope: Архитектурный Анализ и State Machines

**Дата:** 2026-01-11  
**Версия:** 2.0

---

## 1. Обзор Системы

WhaleScope — платформа отслеживания "китов" Polymarket для обнаружения insider trading и генерации торговых сигналов.

### Компоненты:
```
┌──────────────────────────────────────────────────────────────────┐
│                        WhaleScope                                 │
├──────────────────────────────────────────────────────────────────┤
│  INGESTOR              │  SERVICES              │  CLIENTS       │
│  ├─ WebSocket Pulse    │  ├─ AnalysisService    │  ├─ Chrome Ext │
│  ├─ HTTP Detective     │  ├─ StrategyService    │  ├─ Web App    │
│  └─ Auto Discovery     │  ├─ RiskService        │  └─ API        │
│                        │  ├─ PaperTrading       │                │
│                        │  ├─ Resolution         │                │
│                        │  ├─ Funding            │                │
│                        │  └─ Syndicate          │                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. State Machine Диаграммы

### 2.1 🌊 Ingestor State Machine

```
                    ┌─────────────────┐
                    │     IDLE        │
                    └────────┬────────┘
                             │ start()
                             ▼
         ┌───────────────────────────────────────┐
         │           INITIALIZING                 │
         │  • startAutoDiscovery()               │
         │  • Загрузка топ-50 рынков из Gamma    │
         └───────────────────┬───────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │  STREAM A (WS)  │           │  STREAM B (HTTP)│
    │   "The Pulse"   │           │  "Detective"    │
    └────────┬────────┘           └────────┬────────┘
             │                             │
             ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │  WS_CONNECTING  │           │  POLLING_ACTIVE │
    └────────┬────────┘           │  (200ms tick)   │
             │                    └────────┬────────┘
             ▼                             │
    ┌─────────────────┐                    │
    │  WS_CONNECTED   │◄───────────────────┘
    │  • Subscribe    │      Round Robin через
    │  • Ping/20s     │      все asset_ids
    └────────┬────────┘
             │ on('close')
             ▼
    ┌─────────────────┐
    │  RECONNECTING   │──► (5s delay) ──► WS_CONNECTING
    └─────────────────┘
```

### 2.2 📊 Signal Processing Pipeline

```
   RAW TRADE (from Polymarket API)
          │
          ▼
   ┌──────────────────┐
   │  VALIDATION      │ volumeUSD > $100?
   └────────┬─────────┘
            │ YES
            ▼
   ┌──────────────────┐
   │  DEDUPLICATION   │ processedTradeIds.has(id)?
   └────────┬─────────┘
            │ NO (new)
            ▼
   ┌──────────────────┐
   │  WHALE UPSERT    │ Create/Update Whale record
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────────────────────────────────────┐
   │            ANALYSIS SERVICE (Alpha Matrix)       │
   │  ┌─────────────────────────────────────────────┐ │
   │  │ 1. KILL SWITCHES                            │ │
   │  │    • volumeUSD < $500 → SKIP                │ │
   │  │    • Sports market → SKIP                   │ │
   │  │    • Wash Trader (ROI < 2%) → SKIP          │ │
   │  │    • Hamster (WR < 40%) → SKIP              │ │
   │  └──────────────────┬──────────────────────────┘ │
   │                     │ PASS                       │
   │  ┌──────────────────▼──────────────────────────┐ │
   │  │ 2. SCORING (0-100)                          │ │
   │  │    • Performance (Polymarket API stats)     │ │
   │  │    • Insider Score (Funding via Alchemy)    │ │
   │  │    • Volume Signal                          │ │
   │  │                                             │ │
   │  │    PROVEN:  60% perf + 25% insider + 15% vol│ │
   │  │    FRESH:   50% insider + 50% volume        │ │
   │  │    UNKNOWN: 30% perf + 35% ins + 35% vol    │ │
   │  └──────────────────┬──────────────────────────┘ │
   └─────────────────────┼────────────────────────────┘
                         │
                         ▼
   ┌──────────────────────────────────────────────────┐
   │           STRATEGY SERVICE (Radar)               │
   │  ┌─────────────────────────────────────────────┐ │
   │  │ KILL SWITCHES                               │ │
   │  │    • Sports → SKIP                          │ │
   │  │    • Price < 0.20 → SKIP (lottery)          │ │
   │  │    • Price > 0.85 → SKIP (low upside)       │ │
   │  │    • Days to expiry > 7 → SKIP              │ │
   │  │    • Market volume < $10k → SKIP            │ │
   │  └──────────────────┬──────────────────────────┘ │
   │  ┌──────────────────▼──────────────────────────┐ │
   │  │ RADAR SCORE (0-100)                         │ │
   │  │    Freshness (40) + Conviction (40) + Time  │ │
   │  │                                             │ │
   │  │    ≥80 → INSIDER (95% conf)                 │ │
   │  │    ≥60 → INSIDER (75% conf)                 │ │
   │  │    WR>55 + PnL>1k → SNIPER (80% conf)       │ │
   │  └──────────────────┬──────────────────────────┘ │
   └─────────────────────┼────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │    SIGNAL CREATED      │
            │    status: 'OPEN'      │
            │    aiScore: 0-100      │
            │    strategyName: type  │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  PAPER TRADING ENGINE  │
            │  → onSignal()          │
            └────────────────────────┘
```

### 2.3 📝 Paper Position State Machine

```
                    ┌─────────────────┐
                    │   NO POSITION   │
                    └────────┬────────┘
                             │ onSignal() 
                             │ aiScore ≥ minScore
                             │ balance ≥ betSize
                             ▼
                    ┌─────────────────┐
         ┌─────────│      OPEN       │─────────┐
         │         │  entryPrice     │         │
         │         │  amount         │         │
         │         └────────┬────────┘         │
         │                  │                  │
         │    onMarketTrade()                  │ onMarketResolved()
         │                  │                  │
    ┌────┴────┐      ┌──────┴──────┐     ┌─────┴─────┐
    │         │      │             │     │           │
    ▼         ▼      ▼             ▼     ▼           ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│  TP   │ │  SL   │ │ PANIC │ │       │ │  WON  │ │ LOST  │
│ price │ │ price │ │ whale │ │       │ │ exit  │ │ exit  │
│ ≥1+tp │ │ ≤1-sl │ │ sells │ │       │ │ =1.0  │ │ =0.0  │
└───┬───┘ └───┬───┘ └───┬───┘ │       └───┬───┘ └───┬───┘
    │         │         │     │           │         │
    └─────────┴─────────┴─────┼───────────┴─────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     CLOSED      │
                    │   exitReason    │
                    │   pnl           │
                    │   roi           │
                    └─────────────────┘
                              │
                              │ balance += (amount + pnl)
                              ▼
                    ┌─────────────────┐
                    │ STRATEGY UPDATED│
                    │ currentBalance  │
                    └─────────────────┘
```

### 2.4 ⚖️ Signal Resolution State Machine

```
┌────────────────┐                      
│  SIGNAL OPEN   │                      
│  status='OPEN' │                      
└───────┬────────┘                      
        │                               
        │ Resolution Service (every 10m)
        │ checkMarket(slug)             
        ▼                               
┌────────────────────────────────────┐  
│  FETCH GAMMA API                   │  
│  GET /events?slug={slug}           │  
└───────────────┬────────────────────┘  
                │                       
        ┌───────┴───────┐               
        │               │               
        ▼               ▼               
┌───────────────┐ ┌───────────────┐     
│ NOT RESOLVED  │ │   RESOLVED    │     
│ (wait)        │ │ market.resolved│    
└───────────────┘ └───────┬───────┘     
                          │             
                          ▼             
               ┌──────────────────────┐ 
               │ getWinningOutcome()  │ 
               │ • UMA result         │ 
               │ • resolution_price   │ 
               │ • token winner       │ 
               └──────────┬───────────┘ 
                          │             
           ┌──────────────┴──────────────┐
           │                             │
           ▼                             ▼
   ┌───────────────┐            ┌───────────────┐
   │   WON         │            │   LOST        │
   │ outcome match │            │ outcome !=    │
   │ roi = (1-p)/p │            │ roi = -100%   │
   └───────┬───────┘            └───────┬───────┘
           │                             │
           └──────────────┬──────────────┘
                          │
                          ▼
               ┌──────────────────────┐
               │ UPDATE WHALE STATS   │
               │ • Recalc winrate     │
               │ • Recalc total PnL   │
               │ • Update tags        │
               └──────────────────────┘
```

### 2.5 💰 Funding Analysis State Machine

```
┌─────────────────┐
│  ADDRESS INPUT  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  CHECK CACHE    │────►│   CACHE HIT     │
│  (in-memory)    │     │   (< 24h)       │
└────────┬────────┘     └────────┬────────┘
         │ MISS                  │
         ▼                       │
┌─────────────────┐              │
│  CHECK DB       │              │
│  whale.funding* │              │
└────────┬────────┘              │
         │ MISS or STALE         │
         ▼                       │
┌─────────────────┐              │
│  ALCHEMY API    │              │
│  getAssetTransfers│            │
└────────┬────────┘              │
         │                       │
         ▼                       │
┌─────────────────────────────┐  │
│  ANALYZE TRANSFERS          │  │
│  ┌────────────────────────┐ │  │
│  │ Source Lookup:         │ │  │
│  │ • Tornado Cash → +40   │ │  │
│  │ • CEX (Binance) → -10  │ │  │
│  │ • Bridge → +10         │ │  │
│  │ • Whale addr → +20     │ │  │
│  │ • Unknown → 0          │ │  │
│  └────────────────────────┘ │  │
└────────────┬────────────────┘  │
             │                   │
             ▼                   │
┌────────────────────────────┐   │
│  RETURN FundingAnalysis    │◄──┘
│  • tag                     │
│  • scoreBoost              │
│  • sourceName              │
└────────────────────────────┘
```

---

## 3. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL APIs                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Gamma API    │  │ CLOB WS      │  │ Data API     │  │ Alchemy API  │ │
│  │ (metadata)   │  │ (realtime)   │  │ (trades)     │  │ (funding)    │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────┘
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          INGESTOR                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Market Cache                                 │   │
│  │                   Map<asset_id, MarketInfo>                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SERVICES LAYER                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │ Analysis   │  │ Strategy   │  │ Paper      │  │ Resolution │        │
│  │ (scoring)  │  │ (signals)  │  │ Trading    │  │ (settlement)│       │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘        │
│        └───────────────┴───────────────┴───────────────┘                │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         POSTGRES (Prisma)                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Whale   │  │  Signal  │  │ Strategy │  │  Paper   │  │   User   │  │
│  │          │──│          │──│          │──│ Position │  │          │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           HONO API                                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ GET /api/markets/:slug/sentiment                                   │ │
│  │ GET /api/strategies                                                │ │
│  │ GET /health                                                        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
         ┌──────────────────┐        ┌──────────────────┐
         │  Chrome Extension│        │   Next.js Web    │
         │  (Overlay)       │        │   (Dashboard)    │
         └──────────────────┘        └──────────────────┘
```

---

## 4. Анализ Твоего Плана

### ✅ Фаза 1 (Завершена) — Оценка: ОТЛИЧНО

Все core компоненты на месте:
- ✅ Hybrid Ingestor — работает
- ✅ Alpha Matrix (AI Scoring) — использует реальные данные Polymarket
- ✅ Kelly Criterion — в Risk Service
- ✅ Paper Trading — полный цикл с TP/SL/Resolution
- ✅ Funding Service — Alchemy интеграция

### 🎯 Фаза 2: Backtesting — МОЙ АНАЛИЗ

| Задача | Твоя оценка | Моя оценка | Комментарий |
|--------|-------------|------------|-------------|
| **Backtester** | 🔴 HIGH / Medium | 🔴 **HIGH / HARD** | Нужно хранить исторические данные (их нет!). Polymarket API не даёт историю глубже 1 дня |
| **ROI Calculator** | 🔴 HIGH / Easy | ✅ **EASY** | Данные уже есть в `Signal.roi` и `PaperPosition.pnl` |
| **Strategy Optimizer** | 🟡 MED / Medium | 🟡 **MED** | Grid search по параметрам, но без backtester бесполезен |
| **Dashboard Metrics** | 🟡 MED / Easy | ✅ **EASY** | Агрегация из существующих данных |

#### ⚠️ КРИТИЧЕСКАЯ ПРОБЛЕМА: Нет исторических данных!

```sql
-- Текущее состояние: только живые сигналы
SELECT MIN(timestamp), MAX(timestamp) FROM "Signal";
-- Скорее всего: последние 1-7 дней
```

**Для Backtester нужно:**
1. Historical Trade Dump — загрузить все сделки за 3-6 месяцев
2. Market Resolution History — какие рынки как resolved
3. Price History — для симуляции TP/SL

### 🧠 Фаза 3: Deep Intelligence — МОЙ АНАЛИЗ

| Задача | Твоя оценка | Моя оценка | Комментарий |
|--------|-------------|------------|-------------|
| **Wallet Clustering** | 🟡 MED / Hard | 🔴 **HARD** | ML задача, нужны фичи + алгоритм (DBSCAN/HDBSCAN) |
| **Syndicate Detection** | 🟡 MED / Medium | ✅ **УЖЕ ЕСТЬ!** | `SyndicateService` уже реализован |
| **Market Sentiment** | 🟢 LOW / Medium | ✅ **EASY** | `/api/markets/:slug/sentiment` уже работает |
| **Insider Alerts** | 🟡 MED / Easy | ✅ **EASY** | Просто фильтр по `aiScore >= 90` |

### 🤖 Фаза 4: Automation — МОЙ АНАЛИЗ

| Задача | Твоя оценка | Моя оценка | Комментарий |
|--------|-------------|------------|-------------|
| **Telegram Bot** | 🔴 HIGH / Medium | 🔴 **HIGH / EASY** | Grammyjs + вызов API = 2-3 часа работы |
| **Twitter Bot** | 🟡 MED / Medium | 🟡 **MEDIUM** | Twitter API дорогой ($100/mo) и капризный |
| **Webhook API** | 🟡 MED / Easy | ✅ **EASY** | Добавить POST endpoint |
| **Auto-Betting** | 🟢 LOW / Hard | ⛔ **DANGER** | Юридические риски + ошибки = потеря денег |

---

## 5. МОЯ РЕКОМЕНДАЦИЯ: Пересмотренный План

### 🚀 Новый приоритетный порядок:

```
НЕДЕЛЯ 1-2: Quick Wins (ROI + Telegram)
├── 1. ROI Dashboard ← УЖЕ МОЖНО (данные есть)
├── 2. Telegram Bot ← Быстрый результат, привлечение юзеров
└── 3. Insider Alerts ← Простой фильтр + notification

НЕДЕЛЯ 3-4: Data Foundation
├── 4. Historical Data Pipeline ← БЕЗ ЭТОГО BACKTESTER НЕВОЗМОЖЕН
│   ├── Скрипт загрузки истории из Polymarket
│   └── Таблица HistoricalTrade (отдельная от Signal)
└── 5. Market Resolution History

НЕДЕЛЯ 5-6: Backtesting
├── 6. Backtester Engine
└── 7. Strategy Optimizer

ФАЗА 3+: Advanced (когда есть трекшн)
├── Wallet Clustering (ML)
├── Twitter Bot (если есть бюджет)
└── Auto-Betting (НИКОГДА без страховки)
```

---

## 6. Технические Рекомендации

### 6.1 Для ROI Calculator (сейчас)

```typescript
// apps/api/src/routes/strategies.ts — добавить endpoint

app.get('/api/strategies/:id/roi', async (c) => {
  const positions = await prisma.paperPosition.findMany({
    where: { strategyId: id, status: 'CLOSED' }
  });
  
  const totalPnL = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const totalBets = positions.reduce((sum, p) => sum + p.amount, 0);
  const winRate = positions.filter(p => (p.pnl || 0) > 0).length / positions.length;
  
  return c.json({
    totalPnL,
    roi: totalPnL / totalBets,
    winRate,
    totalTrades: positions.length
  });
});
```

### 6.2 Для Telegram Bot (быстрый старт)

```typescript
// apps/api/src/services/telegram.service.ts
import { Bot } from 'grammy';

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

export async function broadcastSignal(signal: Signal) {
  if (signal.aiScore < 85) return; // Only high-confidence
  
  const msg = `🐳 WHALE ALERT\n\n` +
    `Market: ${signal.marketSlug}\n` +
    `Outcome: ${signal.outcome}\n` +
    `Amount: $${signal.amountUSD.toFixed(0)}\n` +
    `AI Score: ${signal.aiScore}/100\n` +
    `Strategy: ${signal.strategyName}`;
  
  await bot.api.sendMessage(CHANNEL_ID, msg);
}
```

### 6.3 Для Historical Data (критично для backtester)

```typescript
// apps/api/src/scripts/backfill-history.ts

async function backfillHistory(days: number = 90) {
  // Polymarket Data API поддерживает cursor pagination
  // Нужно пройти по всем рынкам и сохранить все trades
  
  const markets = await getActiveMarkets();
  for (const market of markets) {
    let cursor = null;
    do {
      const { trades, nextCursor } = await fetchTrades(market.id, cursor);
      await prisma.historicalTrade.createMany({ data: trades });
      cursor = nextCursor;
    } while (cursor);
  }
}
```

---

## 7. Резюме

| Компонент | Статус | Готовность к Production |
|-----------|--------|------------------------|
| Ingestor | ✅ Working | 85% (нужен graceful shutdown) |
| Analysis | ✅ Working | 90% |
| Paper Trading | ✅ Working | 95% |
| Resolution | ✅ Working | 90% |
| Funding | ✅ Working | 80% (зависит от Alchemy quota) |
| Backtester | ❌ Not Started | 0% (нужны исторические данные) |
| Telegram | ❌ Not Started | 0% |
| ROI Dashboard | 🟡 Partial | 60% (данные есть, UI нет) |

**Вывод:** Система solid для live trading, но для backtesting нужна серьёзная работа по сбору исторических данных.
