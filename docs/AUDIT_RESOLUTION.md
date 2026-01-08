# Audit: Resolution Logic & Strategy Lab Readiness

## 1. Existing Resolution Logic (`resolution.service.ts`)
The current "Judge" relies on the Polymarket Gamma API to settle signals.

**Workflow:**
1.  Fetch all `OPEN` signals from DB.
2.  Iterate uniquely by `marketSlug`.
3.  Query Gamma API: `GET https://gamma-api.polymarket.com/markets/{slug}`.
4.  Check `market.resolved` boolean.
5.  Determine Winner:
    *   Reads `uma_resolution_result` or `resolution_price`.
    *   Normalizes "1" → "Yes", "0" → "No".
6.  Settle Signals:
    *   Match `signal.outcome` vs Winner.
    *   Update Status: `WON` / `LOST`.
    *   Calculate ROI: `(1 - entryPrice) / entryPrice` (Assumes expiration at $1.00).
    *   Update Whale Stats: Increment PnL/Winrate.

## 2. The 422 Error Hypothesis
The user reported **422 Unprocessable Entity** errors.
*   **Source:** Likely the Gamma API call `axios.get(...)`.
*   **Cause:**
    *   **Invalid Slugs:** If `marketSlug` in DB is `pending_resolution` or malformed (e.g. spaces, special chars not encoded), Gamma returns 404 or 422.
    *   **Rate Limiting:** Gamma might strict-block aggressive polling, but usually that's 429.
    *   **Data Mismatch:** If `market.uma_resolution_result` is missing or in an unexpected format for non-binary markets.

*   **Mitigation:** The recent fix in `ingestor.ts` to use proper slugs from Trade API should significantly reduce invalid slug errors.

## 3. Database Gap Analysis (`schema.prisma`)
The current schema is designed for **Signal Tracking** (Whale Watching), not **Strategy Testing**.

| Feature | Current Schema | Strategy Lab Requirement |
| :--- | :--- | :--- |
| **Strategy Config** | None (embedded in code) | `Strategy` table (params: minScore, whales, risk) |
| **Paper Wallet** | None | `Portfolio` or `PaperAccount` table (balance, equity) |
| **Performance** | Basic `winrate` on Whale | `EquityCurve` or `TradeHistory` per Strategy |
| **Position Mgmt** | Single `Signal` row | `Position` table (entry, exit, size, PnL) |
| **Backtesting** | None | Ability to replay `Signal` history against a Strategy |

## 4. Recommendations
**Verdict:** **Build New Separate Module**

Refactoring the existing `ResolutionService` is insufficient. It is designed to purely "Grade the Whales". A Strategy Lab needs to "Grade the System".

**Proposed Plan:**
1.  **Keep `ResolutionService`** as the "Oracle" – it strictly determines if a market resolved Yes/No.
2.  **Create `StrategyService`**:
    *   Subscribes to finalized Signals.
    *   Manages "Paper Positions" (Virtual Portfolio).
    *   Implements complex exit logic (e.g., "Sell if price drops 20%").
    *   Records specific "Strategy Performance" separate from "Whale Performance".

**Immediate Action (Fixing 422):**
*   Add stronger validation in `ResolutionService` before calling Gamma (skip if slug is invalid).
*   Handle non-binary markets (which might return complex resolution strings).
