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
    neutralVolume?: number; // [NEW] For UNK/Pending
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

    const fetchData = async (marketSlug: string, retryAttempt = 0) => {
        setLoading(true);

        try {
            // [VPS CONFIGURATION]
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
                    setRetryCount(retryAttempt + 1);
                    setTimeout(() => fetchData(marketSlug, retryAttempt + 1), 2000);
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
        setLoading(false);
    };

    if (!slug) return null;

    const totalVol = (data?.bullishVolume || 0) + (data?.bearishVolume || 0) + (data?.neutralVolume || 0);
    const whaleBullishPct = totalVol > 0 ? (data?.bullishVolume || 0) / totalVol : 0;

    // Calculate Neutral Pct
    const neutralPct = totalVol > 0 ? (data?.neutralVolume || 0) / totalVol : 0;
    const bullishPct = totalVol > 0 ? (data?.bullishVolume || 0) / totalVol : 0;
    const bearishPct = totalVol > 0 ? (data?.bearishVolume || 0) / totalVol : 0;

    const isContrarian = whaleBullishPct < 0.4;

    // ...

    {/* 3. Sentiment Bars (with Neutral) */ }
    <div className="space-y-4">
        <div className="flex justify-between text-[10px] uppercase tracking-widest mb-1 text-emerald-500 font-bold">
            <span>Smart Money</span>
            <span>
                {neutralPct > 0.5 ? 'MIXED/PENDING' : (bullishPct > 0.5 ? 'BULLISH' : 'BEARISH')}
            </span>
        </div>
        <div className="h-2 w-full bg-zinc-900 flex overflow-hidden">
            {/* Bullish */}
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(bullishPct * 100)}%` }}></div>
            {/* Neutral/Pending (Gray) */}
            <div className="h-full bg-zinc-600 transition-all" style={{ width: `${Math.round(neutralPct * 100)}%` }}></div>
            {/* Bearish */}
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${Math.round(bearishPct * 100)}%` }}></div>
        </div>
    </div>

    {/* [NEW] WHALE ROSTER (Active Players) */ }
    {
        data.activeWhales && data.activeWhales.length > 0 && (
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
        )
    }

    {/* 4. HISTORY CHART (Sparkline) */ }
    {
        data.history && data.history.length > 2 && (
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
        )

            </div >
        </div >
    )
}

export default WhaleOverlay
