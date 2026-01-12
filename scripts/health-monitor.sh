#!/bin/bash
# WhaleScope Paper Trading Health Monitor
# Collects statistics on order book usage and entry quality

LOG_FILE="/root/whalescope/apps/api/logs/api-out.log"

echo "=========================================="
echo "📊 WhaleScope Paper Trading Health Report"
echo "=========================================="
echo "Generated at: $(date)"
echo ""

# Count signals received
SIGNALS_RECEIVED=$(grep -c "Paper.*Received:" "$LOG_FILE" 2>/dev/null || echo "0")
echo "📝 Signals Received: $SIGNALS_RECEIVED"
echo ""

# 1. Order Book Usage Statistics
echo "=== Order Book Usage ==="
ORDERBOOK_ENTRIES=$(grep -c "Source: ORDERBOOK" "$LOG_FILE" 2>/dev/null || echo "0")
FALLBACK_ENTRIES=$(grep -c "Source: FALLBACK" "$LOG_FILE" 2>/dev/null || echo "0")
NO_ORDERBOOK=$(grep -c "No order book for\|No tokenId for" "$LOG_FILE" 2>/dev/null || echo "0")

TOTAL_ENTRIES=$((ORDERBOOK_ENTRIES + FALLBACK_ENTRIES))
if [ "$TOTAL_ENTRIES" -gt 0 ]; then
    FALLBACK_PCT=$(awk "BEGIN {printf \"%.1f\", $FALLBACK_ENTRIES * 100 / $TOTAL_ENTRIES}")
    ORDERBOOK_PCT=$(awk "BEGIN {printf \"%.1f\", $ORDERBOOK_ENTRIES * 100 / $TOTAL_ENTRIES}")
else
    FALLBACK_PCT="0.0"
    ORDERBOOK_PCT="0.0"
fi

echo "✅ Real Order Book: $ORDERBOOK_ENTRIES ($ORDERBOOK_PCT%)"
echo "⚠️  Fallback (signal.price): $FALLBACK_ENTRIES ($FALLBACK_PCT%)"
echo "📭 No Order Book Warnings: $NO_ORDERBOOK"
echo ""

# Status indicator
if [ "$FALLBACK_ENTRIES" -gt 0 ]; then
    FALLBACK_CHECK=$(awk "BEGIN {print ($FALLBACK_PCT > 10) ? 1 : 0}")
    if [ "$FALLBACK_CHECK" -eq 1 ]; then
        echo "❌ WARNING: Fallback rate > 10% - Check Order Book API!"
    else
        echo "✅ Fallback rate OK (< 10%)"
    fi
else
    echo "✅ Fallback rate OK (no fallbacks)"
fi
echo ""

# 2. Price Movement Statistics
echo "=== Price Movement Analysis ==="
SKIPPED_PRICE_MOVED=$(grep -c "SKIPPED_PRICE_MOVED" "$LOG_FILE" 2>/dev/null || echo "0")
POSITIONS_OPENED=$(grep -c "Paper.*Opened for" "$LOG_FILE" 2>/dev/null || echo "0")

TOTAL_ATTEMPTS=$((SKIPPED_PRICE_MOVED + POSITIONS_OPENED))
if [ "$TOTAL_ATTEMPTS" -gt 0 ]; then
    SKIP_PCT=$(awk "BEGIN {printf \"%.1f\", $SKIPPED_PRICE_MOVED * 100 / $TOTAL_ATTEMPTS}")
else
    SKIP_PCT="0.0"
fi

echo "🚫 SKIPPED_PRICE_MOVED: $SKIPPED_PRICE_MOVED ($SKIP_PCT% of attempts)"
echo "✅ Successfully Opened: $POSITIONS_OPENED"
echo ""

# 3. Latency Statistics
echo "=== Latency Analysis ==="
SLOW_SIGNALS=$(grep -c "SLOW SIGNAL" "$LOG_FILE" 2>/dev/null || echo "0")
echo "⏱️  Slow Signals (>5s): $SLOW_SIGNALS"

# Extract latency values if available
if [ "$SIGNALS_RECEIVED" -gt 0 ]; then
    echo ""
    echo "Recent Latency Values:"
    grep "Paper.*Received.*Latency:" "$LOG_FILE" 2>/dev/null | tail -5 | sed 's/.*| Latency:/  Latency:/' || echo "  No latency data yet"
fi
echo ""

# 4. BestAsk Usage
echo "=== BestAsk Statistics ==="
USING_BESTASK=$(grep -c "Using BestAsk" "$LOG_FILE" 2>/dev/null || echo "0")
echo "📊 Using BestAsk from Order Book: $USING_BESTASK"
echo ""

# 5. Summary
echo "=========================================="
echo "📋 SUMMARY"
echo "=========================================="
echo "Total Signals:        $SIGNALS_RECEIVED"
echo "Positions Opened:     $POSITIONS_OPENED"
echo "Skipped (Price Moved):$SKIPPED_PRICE_MOVED"
echo "Order Book Hit Rate:  $ORDERBOOK_PCT%"
echo "=========================================="
