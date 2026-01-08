'use client';

import { useEffect, useState } from 'react';

// Interfaces
interface Signal {
    id: string;
    timestamp: string;
    marketSlug: string;
    side: string;
    amountUSD: number;
    aiScore: number;
    tags: string;
    whaleAddress: string; // Added from API
    whale: {
        alias: string | null;
    };
}

import { Header } from '../components/ui/header';

export default function Home() {
    // ... (state logic remains)
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(true);
    const [timestamp, setTimestamp] = useState<string>("");

    useEffect(() => {
        setTimestamp(new Date().toLocaleTimeString());

        // Fetch Data from NEW Endpoint
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/signals/feed`)
            .then((res) => res.json())
            .then((data) => {
                setSignals(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Failed to fetch signals', err);
                setLoading(false);
            });
    }, []);

    // ... (helpers remain)

    // Helper: Truncate Address (0x1234...abcd)
    const truncateAddress = (addr: string) => {
        if (!addr) return 'Anonymous';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    // Helper for Tier Colors
    const getTierColor = (alias: string | null) => {
        if (!alias) return 'text-zinc-500';
        if (alias.includes('Leviathan')) return 'text-amber-400 font-bold';
        if (alias.includes('Shark')) return 'text-purple-400 font-semibold';
        if (alias.includes('Dolphin')) return 'text-cyan-400';
        return 'text-emerald-400';
    };

    return (
        <main className="min-h-screen bg-black text-white p-6 md:p-12 lg:p-24 max-w-[1600px] mx-auto selection:bg-emerald-900 selection:text-white">

            <Header />


            {/* --- BENTO GRID STATS --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-16 mb-32">
                <div className="border-l border-zinc-900 pl-6">
                    <h3 className="text-zinc-600 text-xs uppercase tracking-[0.2em] mb-2 font-bold">System Status</h3>
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-emerald-500 rounded-none animate-pulse"></div>
                        <p className="text-4xl md:text-5xl text-white font-light">LIVE FEED</p>
                    </div>
                </div>
                <div className="border-l border-zinc-900 pl-6">
                    <h3 className="text-zinc-600 text-xs uppercase tracking-[0.2em] mb-2 font-bold">24h Signal Volume</h3>
                    <p className="text-4xl md:text-5xl text-white font-light">$12.5M</p>
                </div>
                {/* Last Sync Block */}
                <div className="border-l border-zinc-900 pl-6">
                    <h3 className="text-zinc-600 text-xs uppercase tracking-[0.2em] mb-2 font-bold">Last Update</h3>
                    <p className="text-4xl md:text-5xl text-zinc-400 font-light font-mono">
                        {timestamp || "--:--:--"}
                    </p>
                </div>
            </div>

            {/* --- SIGNAL FEED --- */}
            <section>
                <div className="flex items-end justify-between mb-8 border-b border-zinc-900 pb-4">
                    <h2 className="text-3xl font-light uppercase tracking-tight text-white">
                        Alpha Stream
                    </h2>
                    <span className="text-zinc-600 text-xs uppercase tracking-widest mb-1">
                        Live Shadow Whale Activity
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <div className="min-w-[800px]">
                        {/* Table Header */}
                        <div className="grid grid-cols-12 gap-4 border-b border-zinc-800 pb-4 text-zinc-500 text-xs uppercase tracking-[0.15em] font-semibold mb-2">
                            <div className="col-span-2">Time</div>
                            <div className="col-span-2">Whale / Actor</div>
                            <div className="col-span-3">Market</div>
                            <div className="col-span-1">Side</div>
                            <div className="col-span-2 text-right">Size (USD)</div>
                            <div className="col-span-2 text-right">AI Score</div>
                        </div>

                        {/* Table Body */}
                        <div className="space-y-1">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <div key={i} className="h-16 border-b border-zinc-900/50 bg-zinc-900/10 animate-pulse"></div>
                                ))
                            ) : signals.length === 0 ? (
                                <div className="py-24 text-center text-zinc-600 uppercase tracking-widest text-sm border-b border-zinc-900">
                                    // No Signals Yet //
                                </div>
                            ) : (
                                signals.map((signal) => (
                                    <div
                                        key={signal.id}
                                        className="grid grid-cols-12 gap-4 items-center py-5 border-b border-zinc-900/30 hover:bg-zinc-900/20 hover:border-zinc-800 transition-all duration-200 group cursor-default"
                                    >
                                        {/* Time */}
                                        <div className="col-span-2 text-zinc-600 font-mono text-xs">
                                            {new Date(signal.timestamp).toLocaleTimeString()}
                                        </div>

                                        {/* Tier / Actor */}
                                        <div className={`col-span-2 font-mono text-xs uppercase tracking-wider ${getTierColor(signal.whale.alias)}`}>
                                            {signal.whale.alias || truncateAddress(signal.whaleAddress)}
                                        </div>

                                        {/* Market */}
                                        <div className="col-span-3 text-zinc-300 font-sans text-sm max-w-[200px] truncate pr-4" title={signal.marketSlug}>
                                            {signal.marketSlug.replace(/-/g, ' ')}
                                        </div>

                                        {/* Side */}
                                        <div className={`col-span-1 font-mono text-sm font-bold ${signal.side === 'BUY' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {signal.side}
                                        </div>

                                        {/* Size */}
                                        <div className="col-span-2 text-right text-white font-mono text-sm">
                                            ${signal.amountUSD.toLocaleString()}
                                        </div>

                                        {/* AI Score (Bar) */}
                                        <div className="col-span-2 flex items-center justify-end gap-2">
                                            <span className="text-zinc-500 text-xs font-mono">{signal.aiScore}</span>
                                            <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${signal.aiScore > 75 ? 'bg-amber-400' : 'bg-zinc-600'}`}
                                                    style={{ width: `${signal.aiScore}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
