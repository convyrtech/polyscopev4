# WhaleScope: System Internals & Reverse Engineering Report

> **Classification**: TOP SECRET // ENGINEERING ONLY
> **Generated**: 2026-01-07
> **Version**: 1.0.0

## 1. Executive Summary
*High-level overview of the system's purpose: A real-time "Inside Trading" detector for Polymarket that tracks whale wallets, aggregates volume by event, and visualizes sentiment via a Chrome Extension overlay and a Web Dashboard.*

---

## 2. Architecture Overview
### 2.1 The "Hybrid Ingestor" Engine
*Detailed analysis of `ingestor.ts`.*
- **Cycle**: How it wakes up, polls, and sleeps.
- **Dual-Mode**: Real-time websocket (clob) vs HTTP backfill.
- **Slug Sync**: The critical link between Event Slugs (Human URL) and Market Slugs (API ID).

### 2.2 The "Brain" (Services)
- **StrategyService**: The math behind the "Radar Score" (0-100).
- **RiskService**: Classification of actors (Whales vs Retail).
- **AnalysisService**: Pattern recognition (Sniper, Accumulator, Dumper).

---

## 3. Data Flow Diagrams
```mermaid
graph TD
    A[Polymarket Gamma API] -->|Metadata| B(Ingestor)
    C[Polymarket CLOB WS] -->|Trades| B
    B -->|Signals| D[Postgres DB]
    D -->|Aggregates| E[Hono API]
    E -->|JSON| F[Chrome Extension (Overlay)]
    E -->|JSON| G[Web Dashboard (Next.js)]
```

---

## 4. Component Deep Dives

### 4.1 Ingestor Logic (`ingestor.ts`)
*Code analysis of `trackNewMarket`, `processDetectiveTrade`.*

### 4.2 Signal Processing
*How raw trades become "Bullish" or "Bearish" signals.*

### 4.3 The "Zero Data" Safety Nets
*Documentation of the fallback mechanisms (PENDING state, Neutral Volume).*

---

## 5. API Specification
*Endpoint contracts.*
- `GET /api/markets/:slug/sentiment`

## 6. Infrastructure
- **VPS**: Ubuntu SystemD / PM2 configuration.
- **Database**: Prisma Schema & Relations.
