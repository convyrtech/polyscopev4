# Audit: Data Flow & Smart Money Tracking

## 1. Raw Data Structure (Data API)
We analyzed the live response from `https://data-api.polymarket.com/trades`.
**Key Fields Found:**
*   `proxyWallet`: The address of the actor.
*   `name`: The username (e.g., "hansjkh").
*   `side`: "BUY" or "SELL".
*   `size`, `price`.

**Missing Fields:**
*   `maker_address`: **NOT PRESENT**.
*   `taker_address`: **NOT PRESENT** (explicitly).

## 2. Who are we tracking?
In the `ingestor.ts`, the code extracts:
```typescript
let makerAddr = trade.maker_address || trade.owner || trade.proxyWallet;
```
Since `maker_address` and `owner` are undefined in the Data API, it uses `proxyWallet`.

**Conclusion:**
*   The `proxyWallet` field in the public Trade API represents the **Taker** (the active aggressor who initiated the trade).
*   **Result:** We **ARE** correctly tracking "Active/Smart Money".
*   **Correction Needed:** The variable name `makerAddr` in the code is **incorrect and misleading**. It should be `actorAddress` or `takerAddress`.

## 3. Side Logic
*   `side: "BUY"` -> The `proxyWallet` account **BOUGHT** (Long exposure).
*   `side: "SELL"` -> The `proxyWallet` account **SOLD** (Short/Closed exposure).

This logic aligns with our goal of tracking Whale aggression.

## 4. Self-Trade Detection
*   **Current State:** Impossible.
*   **Reason:** The API response does not provide the matching Counterparty (`maker_address`).
*   **Impact:** We cannot filter out wash trading (where Actor A buys from Actor A). However, wash trading fees on Clob usually discourage this unless incentivized.

## 5. Recommendations
1.  **Refactor Variable Names:** Rename `makerAddr` to `whaleAddress` or `actorAddress` in `ingestor.ts` to reflect that this is the Taker.
2.  **Trust the Logic:** The core logic of tracking this address is correct for identifying "Smart Money" moves.
3.  **Note on Market Makers:** Passive Market Makers are **NOT** being tracked by this logic (which is good), because their passive limit order fills show up as the Taker's trade (where Taker is the user, not the MM).
