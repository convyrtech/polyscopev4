import cssText from "data-text:~/style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState } from "react"
import { LineChart, Line, YAxis, XAxis } from "recharts"

export const config: PlasmoCSConfig = {
    matches: ["https://polymarket.com/event/*", "https://polymarket.com/market/*"]
}

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = cssText
    return style
}

interface SentimentData {
    market: string;
    bullishVolume: number;
    bearishVolume: number;
    whaleCount: number;
    latestAiScore?: number;
    latestPattern?: string;
    latestSide?: string;
    latestOutcome?: string;
    lastTradeTime?: string;
    history?: { time: string; score: number; price: number }[];
    activeWhales?: { address: string; alias: string; volume: number; winrate: number }[];
}

const WhaleOverlay = () => {
    const [data, setData] = useState<SentimentData | null>(null);
    const [loading, setLoading] = useState(false);
    const [slug, setSlug] = useState("");
    const [isExpanded, setIsExpanded] = useState(true);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        const checkUrl = () => {
            const path = window.location.pathname;
            const parts = path.split('/');
            const potentialSlug = parts[parts.length - 1] === '' ? parts[parts.length - 2] : parts[parts.length - 1];

            if (potentialSlug && potentialSlug !== slug && potentialSlug !== 'events' && potentialSlug !== 'markets') {
                console.log("[WhaleScope] Navigate ->", potentialSlug);
                setSlug(potentialSlug);
                setData(null);
                fetchData(potentialSlug, 0);
            }
        };

        const intervalId = setInterval(checkUrl, 1000);
        checkUrl();

        return () => clearInterval(intervalId);
    }, [slug]);

    useEffect(() => {
        setRetryCount(0); // Reset on slug change
    }, [slug]);

    // [FIX] Accept retryAttempt argument to avoid stale closure state in setTimeout
    const fetchData = async (marketSlug: string, retryAttempt = 0) => {
        setLoading(true);
        // Note: We don't want to flicker 'loading' off during retries.

        try {
            const res = await fetch(`http://87.120.186.161:3001/api/markets/${marketSlug}/sentiment`);
            if (res.ok) {
                const json = await res.json();

                if (json.status === "INITIALIZING") {
                    if (retryAttempt >= 5) {
                        console.warn("[WhaleScope] Max retries reached.");
                        setData(null);
                        setLoading(false);
                        return;
                    }
                    console.log(`[WhaleScope] Initializing... ${retryAttempt + 1}/5`);
                    // Update state for UI visibility (optional, but good for debugging)
                    setRetryCount(retryAttempt + 1);

                    // Pass explicitly incremented count to next call
                    setTimeout(() => fetchData(marketSlug, retryAttempt + 1), 2000);
                    // Keep loading = true
                    return;
                }

                setRetryCount(0);
                setData(json);
            } else {
                setData(null);
            }
        } catch (e) {
            console.error("Fetch failed:", e);
            setData(null);
        }

        // If we reached here, we are not retrying
        setLoading(false);
    };

    if (!slug) return null;

    const totalVol = (data?.bullishVolume || 0) + (data?.bearishVolume || 0);
    const whaleBullishPct = totalVol > 0 ? (data?.bullishVolume || 0) / totalVol : 0;
    const isContrarian = whaleBullishPct < 0.4;

    // Neural Engine Logic
    const pattern = data?.latestPattern || "";
    const score = data?.latestAiScore || 0;

    // New: Dynamic Color/Text Logic for Outcome
    const latestSide = data?.latestSide || "N/A";
    const latestOutcome = data?.latestOutcome || "N/A";

    // Determine Color
    let signalColor = "text-zinc-500 border-zinc-800";
    let bgColor = "bg-zinc-900/10";

    if (latestOutcome === 'Yes') {
        signalColor = "text-emerald-400 border-emerald-500/50";
        bgColor = "bg-emerald-900/20";
    } else if (latestOutcome === 'No') {
        signalColor = "text-rose-500 border-rose-500/50";
        bgColor = "bg-rose-900/20";
    } else if (latestOutcome !== 'N/A') {
        // Custom Outcome (Trump, Real Madrid, etc.) -> BLUE
        signalColor = "text-blue-400 border-blue-500/50";
        bgColor = "bg-blue-900/20";
    }

    const getPatternColor = (p: string) => {
        if (p === 'SMART_ENTRY') return 'text-emerald-400 border-emerald-500/50 shadow-[0_0_10px_rgba(52,211,153,0.3)] bg-emerald-900/20';
        if (p === 'FOMO_CHASE') return 'text-rose-500 border-rose-500/50 animate-pulse bg-rose-900/20';
        if (p === 'PANIC_SELL') return 'text-orange-400 border-orange-500/50 bg-orange-900/20';
        if (p === 'WHALE_EXIT') return 'text-purple-400 border-purple-500/50 bg-purple-900/20';
        return 'text-zinc-500 border-zinc-800';
    }

    return (
        <div className="fixed bottom-6 right-6 z-[9999] font-mono leading-tight antialiased">
            <div className={`
                    bg-black text-white border border-zinc-900 shadow-2xl
                    transition-all duration-300 ease-out
                    ${isExpanded ? 'w-80' : 'w-12'}
                    overflow-hidden
                    ${isExpanded ? 'border-emerald-500/20 shadow-emerald-900/10' : ''}
                `}>
                {/* Header */}
                <div
                    className="flex items-center justify-between p-3 border-b border-zinc-900 cursor-pointer hover:bg-zinc-900/50 bg-black"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className={`text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-500 ${!isExpanded && "hidden"}`}>
                        [ SYSTEM INTERFACE ]
                    </div>
                    <div className={`text-xs ${isExpanded ? "text-zinc-600" : "text-emerald-500 font-bold m-auto animate-pulse"}`}>
                        {isExpanded ? "// v3.1.0" : "◉"}
                    </div>
                </div>

                {/* Content */}
                {isExpanded && (
                    <div className="p-5 bg-black">
                        {loading ? (
                            <div className="py-8 text-center space-y-2">
                                <div className="text-emerald-500 text-xs animate-pulse uppercase tracking-widest">
                                    [ 📡 CONNECTING TO MARKET FEED... ]
                                </div>
                                <div className="text-zinc-700 text-[10px] font-mono">
                                    Target: {slug.slice(0, 15)}...
                                </div>
                            </div>
                        ) : data ? (
                            <div className="space-y-6">

                                {/* 1. LATEST SIGNAL (Dynamic Outcome Support) */}
                                <div className={`p-4 border ${signalColor} ${bgColor} relative overflow-hidden`}>
                                    {/* Blink Animation for Active Signals */}
                                    {(latestSide !== 'N/A') && <div className="absolute top-0 right-0 p-1"><div className="w-2 h-2 bg-current animate-ping opacity-75"></div></div>}

                                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">
                                        Last Detected Action
                                    </div>
                                    <div className="text-lg font-bold tracking-tight truncate">
                                        {latestSide !== 'N/A' ? (
                                            <span>{latestSide} <span className="opacity-80">[{latestOutcome}]</span></span>
                                        ) : (
                                            "NO ACTIVITY"
                                        )}
                                    </div>
                                    <div className="text-[10px] text-zinc-400 mt-2 font-mono">
                                        {data.latestPattern ? `>> DETECTED: ${data.latestPattern.replace('_', ' ')}` : ">> MONITORING FEED..."}
                                    </div>
                                </div>

                                {/* 2. NEURAL ENGINE (Pattern Context) */}
                                {score > 0 && (
                                    <div className="space-y-2 pb-4 border-b border-zinc-900">
                                        <div className="flex justify-between items-center">
                                            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                                                AI Confidence
                                            </div>
                                            <div className="text-[9px] text-zinc-600">
                                                {`${score}%`}
                                            </div>
                                        </div>

                                        <div className={`p-2 border text-center ${getPatternColor(pattern)}`}>
                                            <div className="text-[10px] font-bold tracking-[0.2em] uppercase">
                                                {pattern.replace('_', ' ')}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 3. Sentiment Bars */}
                                <div className="space-y-4">
                                    <div className="flex justify-between text-[10px] uppercase tracking-widest mb-1 text-emerald-500 font-bold">
                                        <span>Smart Money</span>
                                        <span>{Math.round(whaleBullishPct * 100)}% {whaleBullishPct > 0.5 ? 'BULLISH' : 'BEARISH'}</span>
                                    </div>
                                    <div className="h-2 w-full bg-zinc-900 flex">
                                        <div
                                            className={`h-full ${whaleBullishPct > 0.5 ? 'bg-emerald-500' : 'bg-rose-500'} transition-all`}
                                            style={{ width: `${Math.round(whaleBullishPct * 100)}%` }}
                                        ></div>
                                    </div>
                                </div>

                                {/* [NEW] WHALE ROSTER (Active Players) */}
                                {data.activeWhales && data.activeWhales.length > 0 && (
                                    <div className="pt-4 border-t border-zinc-900">
                                        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-2">
                                            Active Whales (Top 5)
                                        </div>
                                        <div className="space-y-2">
                                            {data.activeWhales.map((w, i) => (
                                                <div key={i} className="flex justify-between items-center text-[10px] bg-zinc-900/10 p-1 border border-zinc-800/50">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-zinc-600 font-mono">#{i + 1}</span>
                                                        <span className={`font-bold ${w.winrate > 60 ? 'text-purple-400' : 'text-zinc-300'}`}>
                                                            {w.alias || w.address.slice(0, 6)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-zinc-500">{w.winrate.toFixed(0)}% WR</span>
                                                        <span className="text-emerald-500 font-mono">${(w.volume / 1000).toFixed(1)}k</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 4. HISTORY CHART (Sparkline) */}
                                {data.history && data.history.length > 2 && (
                                    <div className="h-16 w-full border-t border-zinc-900 pt-2 mt-2 opacity-80">
                                        <LineChart width={270} height={60} data={data.history}>
                                            <XAxis dataKey="time" hide />
                                            <YAxis domain={[0, 100]} hide />
                                            <Line
                                                type="monotone"
                                                dataKey="score"
                                                stroke={data.latestAiScore && data.latestAiScore > 50 ? "#34d399" : "#f43f5e"}
                                                strokeWidth={2}
                                                dot={false}
                                                isAnimationActive={false}
                                            />
                                        </LineChart>
                                    </div>
                                )}

                                {/* Footer */}
                                <div className="pt-4 border-t border-zinc-900 text-center">
                                    <div className="text-[9px] text-zinc-700 uppercase tracking-[0.2em]">
                                            // WHALESCOPE INSIDER ACCESS
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-6 border border-dashed border-zinc-800 space-y-2">
                                <div className="text-zinc-500 text-xs tracking-widest uppercase">
                                    [ NO WHALE ACTIVITY ]
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default WhaleOverlay
