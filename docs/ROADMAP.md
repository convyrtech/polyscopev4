# WhaleScope Project Roadmap

## Phase 1: Core Foundation (Completed)
- [x] **Ingestor:** Hybrid WebSocket + HTTP Polling for Polymarket.
- [x] **Database:** Prisma + PostgreSQL schema for Whales and Signals.
- [x] **API:** Data feeds, Sentiment Analysis, and Webhooks.
- [x] **Chrome Extension:** Real-time Overlay on Polymarket UI.
- [x] **Deployment:** VPS setup with HTTPS (Caddy).

## Phase 2: Strategy Lab (Current Priority)
- [ ] **Paper Trading Engine:** Virtual portfolio management.
- [ ] **Strategy Service:** Execution logic for specific signals.
- [ ] **Backtesting:** Replay historical signals against strategies.

## Phase 3: Deep Intelligence (Zero-Budget)
**Goal:** Advanced clustering without paid APIs (e.g., Nansen/DeBank).

### 1. Wallet Clustering (Funding Source)
- **Concept:** Trace the "First Incoming Transaction" of a fresh wallet to identify its funder (CEX or Main Wallet).
- **Implementation:** Use free **Polygon RPCs** to scan the transaction history of new whales.
- **Constraint:** **NO DeBank API needed.** Pure on-chain tracing.

### 2. Behavioral Clustering (Temporal Correlation)
- **Concept:** Detect "Wolf Packs" — wallets that trade the exact same assets within a short window (<60s).
- **Logic:**
  - If Wallet A buys Asset X at 12:00:00.
  - AND Wallet B buys Asset X at 12:00:15.
  - AND this pattern repeats > 3 times.
  - THEN Link Wallet A & B as a "Cluster".
- **Tech:** Batch processing job (Postgres Aggregation).

## Phase 4: Automation & Execution
- [ ] Telegram Bot integration for alerts.
- [ ] Auto-trading (future scope).
