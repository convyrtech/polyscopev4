# 🐳 WhaleScope: State Machine Диаграммы

**Дата:** 2026-01-12  
**Версия:** 1.0  
**Сгенерировано на основе анализа исходного кода**

---

## 📋 Содержание

1. [Ingestor State Machine](#1-ingestor-state-machine)
2. [Paper Position Lifecycle](#2-paper-position-lifecycle)
3. [Analysis Service (Alpha Matrix)](#3-analysis-service-alpha-matrix)
4. [Strategy Service (Radar)](#4-strategy-service-radar)
5. [Signal Resolution](#5-signal-resolution)
6. [Funding Analysis](#6-funding-analysis)
7. [Trade Pattern Classification](#7-trade-pattern-classification)

---

## 1. Ingestor State Machine

Основной компонент сбора данных. Работает в двух потоках: WebSocket (Pulse) и HTTP Polling (Detective).

```mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> INITIALIZING : start()
    
    INITIALIZING --> AUTO_DISCOVERY : startAutoDiscovery()
    
    state AUTO_DISCOVERY {
        FETCH_GAMMA --> PROCESS_MARKETS
        PROCESS_MARKETS --> UPDATE_CACHE
        UPDATE_CACHE --> FETCH_GAMMA : every 60s
    }
    
    INITIALIZING --> WS_CONNECTING : connectWs()
    INITIALIZING --> POLLING_SETUP : startPolling()
    
    state "Stream A: The Pulse" as StreamA {
        WS_CONNECTING --> WS_CONNECTED : on('open')
        WS_CONNECTED --> SUBSCRIBED : subscribeToTopMarkets()
        SUBSCRIBED --> PING_LOOP : startPing()
        PING_LOOP --> PING_LOOP : every 20s
        
        WS_CONNECTED --> WS_RECONNECTING : on('close')
        WS_RECONNECTING --> WS_CONNECTING : delay 5000ms
    }
    
    state "Stream B: Detective" as StreamB {
        POLLING_SETUP --> POLLING_ACTIVE : setInterval 200ms
        
        state POLLING_ACTIVE {
            ROUND_ROBIN --> FETCH_TRADES : next assetId
            FETCH_TRADES --> PROCESS_TRADE : for each trade
            PROCESS_TRADE --> DEDUPLICATE : check processedTradeIds
            DEDUPLICATE --> ROUND_ROBIN : trade processed
        }
    }
    
    POLLING_ACTIVE --> SHUTTING_DOWN : stop()
    WS_CONNECTED --> SHUTTING_DOWN : stop()
    SHUTTING_DOWN --> [*]
```

### Состояния Ingestor

| Состояние | Описание | Триггер перехода |
|-----------|----------|------------------|
| `IDLE` | Начальное состояние | Автоматически при создании |
| `INITIALIZING` | Запуск всех подсистем | `start()` |
| `WS_CONNECTING` | Подключение к WebSocket CLOB | `connectWs()` |
| `WS_CONNECTED` | Активное WebSocket соединение | `on('open')` |
| `POLLING_ACTIVE` | HTTP polling активен | `setInterval()` |
| `SHUTTING_DOWN` | Graceful shutdown | `stop()`, SIGTERM |

---

## 2. Paper Position Lifecycle

Жизненный цикл paper trading позиции от сигнала до закрытия.

```mermaid
stateDiagram-v2
    [*] --> NO_POSITION
    
    NO_POSITION --> EVALUATING : onSignal()
    
    state EVALUATING {
        CHECK_SCORE --> CHECK_BALANCE : aiScore >= minScore
        CHECK_BALANCE --> CALCULATE_LATENCY : balance >= betSize
        CALCULATE_LATENCY --> CALCULATE_SLIPPAGE
        CALCULATE_SLIPPAGE --> SIMULATE_COSTS
        SIMULATE_COSTS --> CREATE_POSITION
    }
    
    EVALUATING --> NO_POSITION : score/balance fail
    CREATE_POSITION --> OPEN : position created
    
    state OPEN {
        MONITORING --> CHECK_TP : onMarketTrade()
        MONITORING --> CHECK_SL : onMarketTrade()
        MONITORING --> CHECK_PANIC : whale exits
        
        CHECK_TP --> TP_TRIGGERED : price >= entry * (1 + tp)
        CHECK_SL --> SL_TRIGGERED : price <= entry * (1 - sl)
        CHECK_PANIC --> PANIC_TRIGGERED : whale sells same market
    }
    
    OPEN --> RESOLVED : onMarketResolved()
    
    state RESOLVED {
        CHECK_OUTCOME --> WON : outcome matches
        CHECK_OUTCOME --> LOST : outcome differs
    }
    
    TP_TRIGGERED --> CLOSING
    SL_TRIGGERED --> CLOSING
    PANIC_TRIGGERED --> CLOSING
    WON --> CLOSING
    LOST --> CLOSING
    
    state CLOSING {
        CALCULATE_EXIT_COSTS --> UPDATE_BALANCE
        UPDATE_BALANCE --> UPDATE_STRATEGY
        UPDATE_STRATEGY --> LOG_RESULT
    }
    
    CLOSING --> CLOSED
    CLOSED --> [*]
```

### Exit Reasons

| Reason | Триггер | Формула PnL |
|--------|---------|-------------|
| `TP` | `price >= entry * (1 + tpPercent)` | `(exitPrice - entryPrice) * amount - costs` |
| `SL` | `price <= entry * (1 - slPercent)` | `(exitPrice - entryPrice) * amount - costs` |
| `PANIC` | Whale exits same market | Market exit price |
| `WON` | Market resolved, outcome matches | `amount * (1/entryPrice - 1)` |
| `LOST` | Market resolved, outcome differs | `-amount` |

---

## 3. Analysis Service (Alpha Matrix)

Скоринговый движок для оценки качества сигнала.

```mermaid
stateDiagram-v2
    [*] --> INPUT_TRADE
    
    INPUT_TRADE --> SYNDICATE_CHECK : calculateScore()
    
    state "Kill Switches" as KillSwitches {
        SYNDICATE_CHECK --> SCORE_100 : isSyndicateActive = true
        SYNDICATE_CHECK --> LIQUIDITY_GATE : not syndicate
        
        LIQUIDITY_GATE --> SCORE_0 : amountUSD < $500
        LIQUIDITY_GATE --> FOMO_CHECK : amount OK
        
        FOMO_CHECK --> SCORE_0 : BUY && price >= 0.92
        FOMO_CHECK --> SPORTS_CHECK : price OK
        
        SPORTS_CHECK --> SCORE_0 : isSportsMarket && !syndicate
        SPORTS_CHECK --> FETCH_DATA : not sports
    }
    
    state "Data Fetch" as DataFetch {
        FETCH_DATA --> FETCH_POLYMARKET : getReliableStats()
        FETCH_POLYMARKET --> FETCH_FUNDING : analyzeFunding()
        FETCH_FUNDING --> ANTI_BOT_CHECK
    }
    
    state "Anti-Bot Layer" as AntiBotLayer {
        ANTI_BOT_CHECK --> SCORE_0 : Wash Trader detected
        ANTI_BOT_CHECK --> SCORE_0 : Spammer detected
        ANTI_BOT_CHECK --> SCORE_0 : Hamster WR < 40%
        ANTI_BOT_CHECK --> CALC_SCORES : clean wallet
    }
    
    state "Score Calculation" as ScoreCalc {
        CALC_SCORES --> CALC_PERFORMANCE
        CALC_PERFORMANCE --> CALC_INSIDER
        CALC_INSIDER --> CALC_VOLUME
        CALC_VOLUME --> DETERMINE_MODE
        
        DETERMINE_MODE --> PROVEN_MODE : isReliable && WR >= 50%
        DETERMINE_MODE --> FRESH_MODE : closedTrades <= 3
        DETERMINE_MODE --> UNKNOWN_MODE : else
        
        PROVEN_MODE --> WEIGHTED_CALC : 60% perf + 25% insider + 15% vol
        FRESH_MODE --> WEIGHTED_CALC : 50% insider + 50% vol
        UNKNOWN_MODE --> WEIGHTED_CALC : 30% perf + 35% insider + 35% vol
    }
    
    WEIGHTED_CALC --> TAG_WHALE : score >= 85
    WEIGHTED_CALC --> RETURN_SCORE : score < 85
    TAG_WHALE --> RETURN_SCORE : add POSSIBLE_INSIDER
    
    SCORE_0 --> [*]
    SCORE_100 --> [*]
    RETURN_SCORE --> [*]
```

### Scoring Modes

| Mode | Условие | Веса |
|------|---------|------|
| `PROVEN` | `isReliable && WR >= 50%` | Perf 60%, Insider 25%, Volume 15% |
| `FRESH` | `closedTrades <= 3` | Insider 50%, Volume 50% |
| `UNKNOWN` | Default | Perf 30%, Insider 35%, Volume 35% |

---

## 4. Strategy Service (Radar)

Определение торговой стратегии на основе Radar Score.

```mermaid
stateDiagram-v2
    [*] --> EVALUATE_INPUT
    
    EVALUATE_INPUT --> KILL_SWITCH_SPORTS : evaluate()
    
    state "Kill Switches" as KillSwitches {
        KILL_SWITCH_SPORTS --> SKIP_SPORTS : isSports = true
        KILL_SWITCH_SPORTS --> RADAR_CALC : not sports
    }
    
    state "Radar Score Calculation" as RadarCalc {
        RADAR_CALC --> FRESHNESS_CHECK
        
        FRESHNESS_CHECK --> ADD_40 : winrate = 0 && pnl = 0
        FRESHNESS_CHECK --> ADD_0_FRESH : has history
        
        ADD_40 --> CONVICTION_CHECK
        ADD_0_FRESH --> CONVICTION_CHECK
        
        CONVICTION_CHECK --> ADD_40_CONV : amount >= $5000
        CONVICTION_CHECK --> ADD_30_CONV : amount >= $2000
        CONVICTION_CHECK --> ADD_20_CONV : amount >= $1000
        CONVICTION_CHECK --> ADD_10_CONV : amount >= $500
        CONVICTION_CHECK --> ADD_0_CONV : amount < $500
        
        ADD_40_CONV --> TIMING_CHECK
        ADD_30_CONV --> TIMING_CHECK
        ADD_20_CONV --> TIMING_CHECK
        ADD_10_CONV --> TIMING_CHECK
        ADD_0_CONV --> TIMING_CHECK
        
        TIMING_CHECK --> ADD_20_TIME : marketVol < $100k
        TIMING_CHECK --> ADD_10_TIME : marketVol < $500k
        TIMING_CHECK --> ADD_0_TIME : marketVol >= $500k
    }
    
    ADD_20_TIME --> RADAR_THRESHOLD
    ADD_10_TIME --> RADAR_THRESHOLD
    ADD_0_TIME --> RADAR_THRESHOLD
    
    state "Strategy Decision" as StrategyDecision {
        RADAR_THRESHOLD --> INSIDER_HIGH : score >= 80
        RADAR_THRESHOLD --> INSIDER_MED : score >= 60
        RADAR_THRESHOLD --> REALITY_FILTERS : score < 60
        
        INSIDER_HIGH --> BET_INSIDER_95 : confidence 95%
        INSIDER_MED --> BET_INSIDER_75 : confidence 75%
        
        REALITY_FILTERS --> SKIP_TIME : daysToExpiry > 7
        REALITY_FILTERS --> SKIP_LIQUIDITY : marketVol < $10k
        REALITY_FILTERS --> SKIP_PRICE_LOW : price < 0.20 && lowScore
        REALITY_FILTERS --> SKIP_PRICE_HIGH : price > 0.85
        REALITY_FILTERS --> SNIPER_CHECK : all filters pass
        
        SNIPER_CHECK --> BET_SNIPER : WR > 55% && PnL > $1000
        SNIPER_CHECK --> SKIP_NO_MATCH : no strategy matched
    }
    
    BET_INSIDER_95 --> [*]
    BET_INSIDER_75 --> [*]
    BET_SNIPER --> [*]
    SKIP_SPORTS --> [*]
    SKIP_TIME --> [*]
    SKIP_LIQUIDITY --> [*]
    SKIP_PRICE_LOW --> [*]
    SKIP_PRICE_HIGH --> [*]
    SKIP_NO_MATCH --> [*]
```

### Radar Score Formula

```
RadarScore = Freshness (max 40) + Conviction (max 40) + Timing (max 20)

Freshness:
  - Fresh wallet (WR=0, PnL=0): +40
  - Proven wallet: +0

Conviction:
  - >= $5,000: +40
  - >= $2,000: +30
  - >= $1,000: +20
  - >= $500: +10

Timing:
  - Market vol < $100k: +20
  - Market vol < $500k: +10
```

---

## 5. Signal Resolution

Процесс settlement открытых сигналов.

```mermaid
stateDiagram-v2
    [*] --> SCHEDULER
    
    SCHEDULER --> FETCH_OPEN_SIGNALS : every 10 minutes
    
    state "Resolution Loop" as ResolutionLoop {
        FETCH_OPEN_SIGNALS --> GROUP_BY_SLUG
        GROUP_BY_SLUG --> CHECK_MARKET : for each unique slug
        
        CHECK_MARKET --> FETCH_GAMMA_API
        FETCH_GAMMA_API --> PARSE_RESPONSE
        
        PARSE_RESPONSE --> NOT_RESOLVED : market.resolved = false
        PARSE_RESPONSE --> GET_WINNER : market.resolved = true
        
        NOT_RESOLVED --> NEXT_SLUG : skip, wait
        
        state "Determine Winner" as DetermineWinner {
            GET_WINNER --> CHECK_UMA : umaResolutionStatus
            CHECK_UMA --> UMA_WINNER : has UMA result
            
            GET_WINNER --> CHECK_RESOLUTION_PRICE : no UMA
            CHECK_RESOLUTION_PRICE --> YES_WINS : resolutionPrice = "1"
            CHECK_RESOLUTION_PRICE --> NO_WINS : resolutionPrice = "0"
            CHECK_RESOLUTION_PRICE --> TOKEN_WINNER : resolutionPrice = other
            
            TOKEN_WINNER --> FIND_TOKEN : tokens[price >= 0.99].outcome
        }
        
        UMA_WINNER --> SETTLE_SIGNALS
        YES_WINS --> SETTLE_SIGNALS
        NO_WINS --> SETTLE_SIGNALS
        FIND_TOKEN --> SETTLE_SIGNALS
    }
    
    state "Settlement" as Settlement {
        SETTLE_SIGNALS --> UPDATE_SIGNAL : for each signal
        UPDATE_SIGNAL --> CALC_ROI
        
        CALC_ROI --> SIGNAL_WON : outcome matches winner
        CALC_ROI --> SIGNAL_LOST : outcome differs
        
        SIGNAL_WON --> UPDATE_WHALE_STATS
        SIGNAL_LOST --> UPDATE_WHALE_STATS
        
        UPDATE_WHALE_STATS --> NOTIFY_PAPER_TRADING : onMarketResolved()
    }
    
    NOTIFY_PAPER_TRADING --> NEXT_SLUG
    NEXT_SLUG --> CHECK_MARKET : more slugs
    NEXT_SLUG --> WAIT_INTERVAL : all done
    WAIT_INTERVAL --> SCHEDULER : after 10 min
```

### ROI Calculation

| Результат | Формула ROI |
|-----------|-------------|
| `WON` | `(1 - entryPrice) / entryPrice * 100%` |
| `LOST` | `-100%` |

---

## 6. Funding Analysis

Анализ источников финансирования кошелька.

```mermaid
stateDiagram-v2
    [*] --> INPUT_ADDRESS
    
    INPUT_ADDRESS --> CHECK_MEMORY_CACHE : analyzeFunding()
    
    state "Caching Layer" as CachingLayer {
        CHECK_MEMORY_CACHE --> CACHE_HIT_MEMORY : found && age < 24h
        CHECK_MEMORY_CACHE --> CHECK_DB_CACHE : not in memory
        
        CHECK_DB_CACHE --> CACHE_HIT_DB : whale.fundingTag exists
        CHECK_DB_CACHE --> ALCHEMY_FETCH : no DB record
        
        CACHE_HIT_MEMORY --> RETURN_CACHED
        CACHE_HIT_DB --> RETURN_CACHED
    }
    
    state "Alchemy Analysis" as AlchemyAnalysis {
        ALCHEMY_FETCH --> GET_TRANSFERS : getAssetTransfers()
        GET_TRANSFERS --> ANALYZE_SOURCES : for each transfer
        
        state "Source Classification" as SourceClass {
            ANALYZE_SOURCES --> CHECK_TORNADO : from address
            CHECK_TORNADO --> TAG_SUSPICIOUS : Tornado Cash = +40
            
            ANALYZE_SOURCES --> CHECK_CEX
            CHECK_CEX --> TAG_RETAIL : Binance/Coinbase = -10
            
            ANALYZE_SOURCES --> CHECK_BRIDGE
            CHECK_BRIDGE --> TAG_BRIDGE : Bridge = +10
            
            ANALYZE_SOURCES --> CHECK_WHALE
            CHECK_WHALE --> TAG_WHALE : Known whale = +20
            
            ANALYZE_SOURCES --> CHECK_PROTOCOL
            CHECK_PROTOCOL --> TAG_PROTOCOL : DeFi protocol = 0
            
            ANALYZE_SOURCES --> TAG_UNKNOWN : Unknown = 0
        }
        
        TAG_SUSPICIOUS --> AGGREGATE_SCORE
        TAG_RETAIL --> AGGREGATE_SCORE
        TAG_BRIDGE --> AGGREGATE_SCORE
        TAG_WHALE --> AGGREGATE_SCORE
        TAG_PROTOCOL --> AGGREGATE_SCORE
        TAG_UNKNOWN --> AGGREGATE_SCORE
        
        AGGREGATE_SCORE --> DETERMINE_PRIMARY
        DETERMINE_PRIMARY --> BUILD_RESULT
    }
    
    BUILD_RESULT --> PERSIST_TO_DB : whale.update()
    PERSIST_TO_DB --> UPDATE_MEMORY_CACHE
    UPDATE_MEMORY_CACHE --> RETURN_RESULT
    
    RETURN_CACHED --> [*]
    RETURN_RESULT --> [*]
```

### Funding Tags & Score Boosts

| Tag | Score Boost | Источники |
|-----|-------------|-----------|
| `SUSPICIOUS_INSIDER` | +40 | Tornado Cash, Mixers |
| `WHALE` | +20 | Known whale addresses |
| `BRIDGE` | +10 | Multichain, Stargate, Hop |
| `PROTOCOL` | 0 | DeFi protocols |
| `RETAIL` | -10 | Binance, Coinbase, Kraken |
| `UNKNOWN` | 0 | Unidentified sources |

---

## 7. Trade Pattern Classification

Классификация паттернов торговли.

```mermaid
stateDiagram-v2
    [*] --> CHECK_SIDE
    
    CHECK_SIDE --> BUY_ANALYSIS : side = 'BUY'
    CHECK_SIDE --> SELL_ANALYSIS : side = 'SELL'
    
    state "Buy Patterns" as BuyPatterns {
        BUY_ANALYSIS --> FOMO_CHASE : price >= 0.92
        BUY_ANALYSIS --> SMART_ENTRY : price < 0.35
        BUY_ANALYSIS --> NORMAL_BUY : 0.35 <= price < 0.92
    }
    
    state "Sell Patterns" as SellPatterns {
        SELL_ANALYSIS --> PANIC_SELL : price < 0.10
        SELL_ANALYSIS --> WHALE_EXIT : price > 0.80
        SELL_ANALYSIS --> NORMAL_SELL : 0.10 <= price <= 0.80
    }
    
    FOMO_CHASE --> [*] : TradePattern.FOMO_CHASE
    SMART_ENTRY --> [*] : TradePattern.SMART_ENTRY
    NORMAL_BUY --> [*] : TradePattern.NORMAL
    PANIC_SELL --> [*] : TradePattern.PANIC_SELL
    WHALE_EXIT --> [*] : TradePattern.WHALE_EXIT
    NORMAL_SELL --> [*] : TradePattern.NORMAL
```

### Pattern Thresholds

| Pattern | Side | Price Condition | Meaning |
|---------|------|-----------------|---------|
| `FOMO_CHASE` | BUY | `>= 0.92` | Buying near certainty, poor R/R |
| `SMART_ENTRY` | BUY | `< 0.35` | High upside potential |
| `PANIC_SELL` | SELL | `< 0.10` | Dumping at loss |
| `WHALE_EXIT` | SELL | `> 0.80` | Taking profits |
| `NORMAL` | Any | Between thresholds | Standard trading |

---

## 📊 Общая Архитектура

```mermaid
flowchart TB
    subgraph External["🌐 External APIs"]
        GAMMA["Gamma API<br/>(Metadata)"]
        CLOB["CLOB WebSocket<br/>(Realtime)"]
        DATA["Data API<br/>(Trades)"]
        ALCHEMY["Alchemy API<br/>(Funding)"]
        POLYMARKET_DATA["Polymarket Data API<br/>(Stats)"]
    end
    
    subgraph Ingestor["🔄 Ingestor"]
        PULSE["Stream A: Pulse<br/>(WebSocket)"]
        DETECTIVE["Stream B: Detective<br/>(HTTP Polling)"]
        CACHE["Market Cache<br/>(In-Memory)"]
    end
    
    subgraph Services["⚙️ Services Layer"]
        ANALYSIS["Analysis Service<br/>(Alpha Matrix)"]
        STRATEGY["Strategy Service<br/>(Radar)"]
        PAPER["Paper Trading<br/>(Simulator)"]
        RESOLUTION["Resolution Service<br/>(Settlement)"]
        FUNDING["Funding Service<br/>(Source Detection)"]
        SYNDICATE["Syndicate Service<br/>(Whale Groups)"]
    end
    
    subgraph Database["💾 PostgreSQL"]
        WHALE["Whale"]
        SIGNAL["Signal"]
        STRAT_DB["Strategy"]
        POSITION["PaperPosition"]
    end
    
    subgraph Clients["📱 Clients"]
        EXT["Chrome Extension"]
        WEB["Next.js Dashboard"]
        API_ROUTES["Hono API Routes"]
    end
    
    GAMMA --> INGESTOR
    CLOB --> PULSE
    DATA --> DETECTIVE
    ALCHEMY --> FUNDING
    POLYMARKET_DATA --> ANALYSIS
    
    DETECTIVE --> ANALYSIS
    ANALYSIS --> STRATEGY
    STRATEGY --> PAPER
    STRATEGY --> SIGNAL
    
    RESOLUTION --> SIGNAL
    RESOLUTION --> PAPER
    RESOLUTION --> WHALE
    
    FUNDING --> ANALYSIS
    SYNDICATE --> ANALYSIS
    
    SIGNAL --> API_ROUTES
    API_ROUTES --> EXT
    API_ROUTES --> WEB
```

---

## 📁 Файлы исходного кода

| Компонент | Путь | Строк кода |
|-----------|------|------------|
| Ingestor | [ingestor.ts](file:///root/whalescope/apps/api/src/ingestor.ts) | 1053 |
| Paper Trading | [paper-trading.service.ts](file:///root/whalescope/apps/api/src/services/paper-trading.service.ts) | 533 |
| Analysis (Alpha Matrix) | [analysis.service.ts](file:///root/whalescope/apps/api/src/services/analysis.service.ts) | 312 |
| Strategy (Radar) | [strategy.service.ts](file:///root/whalescope/apps/api/src/services/strategy.service.ts) | 201 |
| Resolution | [resolution.service.ts](file:///root/whalescope/apps/api/src/services/resolution.service.ts) | 238 |
| Funding | [funding.service.ts](file:///root/whalescope/apps/api/src/services/funding.service.ts) | 387 |
