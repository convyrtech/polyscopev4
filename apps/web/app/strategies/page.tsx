'use client';

import { useEffect, useState } from 'react';
import { Header } from '../../components/ui/header';
import { Tabs } from '../../components/ui/tabs';
import { StrategyCard } from '../../components/strategies/strategy-card';
import { AnalyticsCard, RiskProfileChart, SpeedProfileChart, PnLChart } from '../../components/strategies/analytics-card';

// ... interfaces ...
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
    strategy: { name: string; id?: string };
    strategyId: string;
    exitReason?: string;
}

interface Analytics {
    riskProfile: { bucket: string; trades: number; wins: number; winRate: number }[];
    speedProfile: { duration: string; avgPnL: number; count: number }[];
    pnlHistory: { date: string; dailyPnL: number; cumulativePnL: number }[];
}

export default function StrategyPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);

    // Filter States
    const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const toggleStrategy = (id: string) => {
        if (selectedStrategyId === id) {
            setSelectedStrategyId(null);
        } else {
            setSelectedStrategyId(id);
        }
    };

    // Filter Logic: API already filters by status, just filter by strategy if selected
    const filteredPositions = selectedStrategyId
        ? positions.filter(p => p.strategyId === selectedStrategyId)
        : positions;

    // Helper: Calculate holding time for active positions
    const getHoldingTime = (openedAt: string) => {
        const ms = Date.now() - new Date(openedAt).getTime();
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch positions based on active tab (OPEN for ACTIVE, CLOSED for HISTORY)
                const statusParam = activeTab === 'ACTIVE' ? 'OPEN' : 'CLOSED';

                const [statsRes, stratRes, posRes, analyticsRes] = await Promise.all([
                    fetch(`${API_URL}/api/strategies/stats`),
                    fetch(`${API_URL}/api/strategies`),
                    fetch(`${API_URL}/api/strategies/positions?status=${statusParam}`),
                    fetch(`${API_URL}/api/strategies/analytics`)
                ]);

                setStats(await statsRes.json());
                setStrategies(await stratRes.json());
                setPositions(await posRes.json());
                setAnalytics(await analyticsRes.json());
            } catch (e) {
                console.error('Failed to load strategy data', e);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000); // 5s Poll
        return () => clearInterval(interval);
    }, [activeTab]); // Re-fetch when tab changes

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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 mb-12 md:mb-24 border-y border-zinc-900 py-6 md:py-12">
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

            {/* ANALYTICS DASHBOARD */}
            <section className="mb-16 md:mb-24">
                <h2 className="text-2xl font-light uppercase tracking-tight text-white mb-8">
                    Performance Analytics
                    <span className="text-zinc-600 text-xs ml-4 font-mono tracking-widest">HEDGE FUND VIEW</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <AnalyticsCard title="Risk Profile" subtitle="Win rate by entry price">
                        {analytics ? (
                            <RiskProfileChart data={analytics.riskProfile} />
                        ) : (
                            <div className="h-32 animate-pulse bg-zinc-900/50" />
                        )}
                    </AnalyticsCard>

                    <AnalyticsCard title="Speed Profile" subtitle="Avg PnL by holding time">
                        {analytics ? (
                            <SpeedProfileChart data={analytics.speedProfile} />
                        ) : (
                            <div className="h-32 animate-pulse bg-zinc-900/50" />
                        )}
                    </AnalyticsCard>

                    <AnalyticsCard title="Cumulative PnL" subtitle="Performance over time">
                        {analytics ? (
                            <PnLChart data={analytics.pnlHistory} />
                        ) : (
                            <div className="h-32 animate-pulse bg-zinc-900/50" />
                        )}
                    </AnalyticsCard>
                </div>
            </section>

            {/* STRATEGIES GRID */}
            <section className="mb-24">
                <h2 className="text-2xl font-light uppercase tracking-tight text-white mb-8">Active Strategies</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {strategies.map(s => (
                        <StrategyCard
                            key={s.id}
                            strategy={s}
                            isSelected={selectedStrategyId === s.id}
                            onClick={() => toggleStrategy(s.id)}
                        />
                    ))}
                </div>
            </section>

            {/* POSITIONS TABLE */}
            <section>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
                    <div>
                        <h2 className="text-2xl font-light uppercase tracking-tight text-white mb-4">
                            Paper Positions
                            <span className="text-zinc-500 text-sm ml-4 font-mono tracking-widest">
                                ({filteredPositions.length})
                            </span>
                        </h2>
                        <Tabs
                            tabs={['ACTIVE', 'HISTORY']}
                            activeTab={activeTab}
                            onTabChange={(tab) => setActiveTab(tab as 'ACTIVE' | 'HISTORY')}
                        />
                    </div>
                    {selectedStrategyId && (
                        <button
                            onClick={() => setSelectedStrategyId(null)}
                            className="text-xs uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors"
                        >
                            [ Clear Filter ]
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto border border-zinc-900">
                    <table className="w-full text-left text-sm font-mono min-w-[800px]">
                        <thead className="bg-zinc-900/50 text-zinc-500 uppercase tracking-wider text-xs border-b border-zinc-900">
                            <tr>
                                <th className="p-4 font-semibold">{activeTab === 'ACTIVE' ? 'Holding' : 'Time'}</th>
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
                            {filteredPositions.map(p => (
                                <tr key={p.id} className="hover:bg-zinc-900/20 transition-colors">
                                    <td className="p-4 text-zinc-500 whitespace-nowrap">
                                        {activeTab === 'ACTIVE'
                                            ? <span className="text-amber-400">{getHoldingTime(p.openedAt)}</span>
                                            : new Date(p.openedAt).toLocaleTimeString()
                                        }
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
