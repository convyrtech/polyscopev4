'use client';

import { useEffect, useState } from 'react';
import { Header } from '../components/ui/header';
import { SignalRow, SignalTableHeader, Signal } from '../components/feed/signal-row';
import { WalletSearch } from '../components/feed/wallet-search';

export default function Home() {
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(true);
    const [timestamp, setTimestamp] = useState<string>("");

    useEffect(() => {
        setTimestamp(new Date().toLocaleTimeString());

        // Fetch Data from API
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
                    <p className="text-4xl md:text-5xl text-white font-light">TRACKING</p>
                </div>
                {/* Last Sync Block */}
                <div className="border-l border-zinc-900 pl-6">
                    <h3 className="text-zinc-600 text-xs uppercase tracking-[0.2em] mb-2 font-bold">Last Update</h3>
                    <p className="text-4xl md:text-5xl text-zinc-400 font-light font-mono">
                        {timestamp || "--:--:--"}
                    </p>
                </div>
            </div>

            {/* --- LEGEND --- */}
            <div className="mb-8 flex flex-wrap gap-6 text-xs text-zinc-500 border border-zinc-900 p-4 rounded">
                <span className="font-semibold text-zinc-400 uppercase tracking-wider">Legend:</span>
                <span>🌪️ Mixer Funded</span>
                <span>🏦 CEX Funded</span>
                <span>🌉 Bridge User</span>
                <span className="border-l border-zinc-800 pl-6">🎯 Sniper</span>
                <span>🦈 Shark</span>
                <span>🐋 Leviathan</span>
                <span>🐹 Hamster</span>
                <span>🌱 Fresh</span>
                <span>👁️ Insider</span>
            </div>

            {/* --- WALLET SCANNER --- */}
            <section className="mb-16">
                <div className="flex items-end justify-between mb-6 border-b border-zinc-900 pb-4">
                    <h2 className="text-2xl font-light uppercase tracking-tight text-white">
                        🔍 Wallet Scanner
                    </h2>
                    <span className="text-zinc-600 text-xs uppercase tracking-widest mb-1">
                        Instant Dossier on Any Address
                    </span>
                </div>
                <WalletSearch />
            </section>

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
                    <div className="min-w-[900px]">
                        {/* Table Header */}
                        <SignalTableHeader />

                        {/* Table Body */}
                        <div className="space-y-0">
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
                                    <SignalRow key={signal.id} signal={signal} />
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* --- FOOTER --- */}
            <footer className="mt-24 pt-8 border-t border-zinc-900 text-center text-zinc-600 text-xs uppercase tracking-widest">
                <p>WhaleScope v2.0 — Polymarket Insider Detector</p>
            </footer>
        </main>
    );
}
