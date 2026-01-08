'use client';

import { useEffect, useState } from 'react';
import { Header } from '../../components/ui/header';

interface Stats {
    activePositions: number;
    netPnL: number;
    winRate: number;
    totalTrades: number;
}

interface Strategy {
    id: string;
    name: string;
    status: string;
    config: any;
    totalPnL: number;
}

interface Position {
    id: string;
    marketSlug: string;
    outcome: string;
    entryPrice: number;
    exitPrice: number | null;
    pnl: number | null;
    status: string;
    openedAt: string;
    strategy: { name: string };
    exitReason?: string;
}

export default function StrategyPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsRes, stratRes, posRes] = await Promise.all([
                    fetch(`${API_URL}/api/strategies/stats`),
                    fetch(`${API_URL}/api/strategies`),
                    fetch(`${API_URL}/api/strategies/positions`)
                ]);

                setStats(await statsRes.json());
                setStrategies(await stratRes.json());
                setPositions(await posRes.json());
            } catch (e) {
                console.error('Failed to load strategy data', e);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000); // 5s Poll
        return () => clearInterval(interval);
    }, []);

    const formatCurrency = (val: number | null) => {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    };

    const getPnLColor = (val: number | null) => {
        if (!val) return 'text-zinc-500';
        return val > 0 ? 'text-emerald-400' : val < 0 ? 'text-rose-400' : 'text-zinc-300';
    };

    return (
        <main className="min-h-screen bg-black text-white p-6 md:p-12 lg:p-24 max-w-[1600px] mx-auto selection:bg-emerald-900 selection:text-white">
            <Header />

            {/* STATS BAR */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-24 border-y border-zinc-900 py-12">
                <div>
                    <h3 className="text-zinc-600 text-xs uppercase tracking-[0.2em] mb-2 font-bold">Net PnL</h3>
                    <p className={`text-4xl md:text-5xl font-light ${getPnLColor(stats?.netPnL || 0)}`}>
                        {stats ? formatCurrency(stats.netPnL) : '...'}
                    </p>
                </div>
                <div>
                    <h3 className="text-zinc-600 text-xs uppercase tracking-[0.2em] mb-2 font-bold">Win Rate</h3>
                    <p className="text-4xl md:text-5xl text-white font-light">
                        {stats ? `${stats.winRate}%` : '...'}
                    </p>
                </div>
                <div>
                    <h3 className="text-zinc-600 text-xs uppercase tracking-[0.2em] mb-2 font-bold">Active Trades</h3>
                    <p className="text-4xl md:text-5xl text-amber-400 font-light animate-pulse">
                        {stats ? stats.activePositions : '...'}
                    </p>
                </div>
                <div>
                    <h3 className="text-zinc-600 text-xs uppercase tracking-[0.2em] mb-2 font-bold">Total Closed</h3>
                    <p className="text-4xl md:text-5xl text-zinc-500 font-light">
                        {stats ? stats.totalTrades : '...'}
                    </p>
                </div>
            </div>

            {/* STRATEGIES GRID */}
            <section className="mb-24">
                <h2 className="text-2xl font-light uppercase tracking-tight text-white mb-8">Active Strategies</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {strategies.map(s => (
                        <div key={s.id} className="border border-zinc-900 bg-zinc-900/10 p-6 hover:border-zinc-700 transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl text-white font-medium">{s.name}</h3>
                                <span className={`text-xs px-2 py-1 uppercase tracking-wider ${s.status === 'ACTIVE' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                                    {s.status}
                                </span>
                            </div>
                            <div className="space-y-2 text-sm text-zinc-500 font-mono">
                                <div className="flex justify-between">
                                    <span>TP: {s.config?.takeProfit ? `+${s.config.takeProfit * 100}%` : '-'}</span>
                                    <span>SL: {s.config?.stopLoss ? `-${s.config.stopLoss * 100}%` : '-'}</span>
                                </div>
                                <div className="flex justify-between border-t border-zinc-900pt-2 mt-2">
                                    <span>Total PnL:</span>
                                    <span className={getPnLColor(s.totalPnL)}>{formatCurrency(s.totalPnL)}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* POSITIONS TABLE */}
            <section>
                <h2 className="text-2xl font-light uppercase tracking-tight text-white mb-8">Paper Positions</h2>
                <div className="overflow-x-auto border border-zinc-900">
                    <table className="w-full text-left text-sm font-mono">
                        <thead className="bg-zinc-900/50 text-zinc-500 uppercase tracking-wider text-xs border-b border-zinc-900">
                            <tr>
                                <th className="p-4 font-semibold">Time</th>
                                <th className="p-4 font-semibold">Strategy</th>
                                <th className="p-4 font-semibold">Market</th>
                                <th className="p-4 font-semibold">Outcome</th>
                                <th className="p-4 text-right font-semibold">Entry</th>
                                <th className="p-4 text-right font-semibold">Current/Exit</th>
                                <th className="p-4 text-right font-semibold">PnL</th>
                                <th className="p-4 text-right font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
                            {positions.map(p => (
                                <tr key={p.id} className="hover:bg-zinc-900/20 transition-colors">
                                    <td className="p-4 text-zinc-500 whitespace-nowrap">
                                        {new Date(p.openedAt).toLocaleTimeString()}
                                    </td>
                                    <td className="p-4 text-zinc-300">{p.strategy.name}</td>
                                    <td className="p-4 text-zinc-400 max-w-[200px] truncate" title={p.marketSlug}>
                                        {p.marketSlug}
                                    </td>
                                    <td className="p-4 text-white">{p.outcome}</td>
                                    <td className="p-4 text-right text-zinc-400">
                                        ${p.entryPrice.toFixed(3)}
                                    </td>
                                    <td className="p-4 text-right text-zinc-400">
                                        {p.exitPrice ? `$${p.exitPrice.toFixed(3)}` : '-'}
                                    </td>
                                    <td className={`p-4 text-right font-bold ${getPnLColor(p.pnl)}`}>
                                        {p.pnl ? formatCurrency(p.pnl) : '-'}
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className={`text-xs uppercase ${p.status === 'OPEN' ? 'text-amber-400 animate-pulse' : 'text-zinc-600'}`}>
                                            {p.exitReason || p.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </main>
    );
}
