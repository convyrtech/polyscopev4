'use client';

import React from 'react';

interface RiskProfileData {
    bucket: string;
    trades: number;
    wins: number;
    winRate: number;
}

interface SpeedProfileData {
    duration: string;
    avgROI: number;
    count: number;
}

interface PnLHistoryData {
    date: string;
    dailyPnL: number;
    cumulativePnL: number;
}

interface AnalyticsCardProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}

export function AnalyticsCard({ title, subtitle, children }: AnalyticsCardProps) {
    return (
        <div className="border border-zinc-800 bg-zinc-900/20 p-6 relative overflow-hidden">
            {/* Corner accent */}
            <div className="absolute top-0 left-0 w-16 h-[2px] bg-emerald-500/50" />
            <div className="absolute top-0 left-0 w-[2px] h-16 bg-emerald-500/50" />

            <h3 className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold mb-1">{title}</h3>
            {subtitle && <p className="text-zinc-600 text-xs mb-4 font-mono">{subtitle}</p>}
            <div className="relative z-10">{children}</div>
        </div>
    );
}

// Horizontal bar chart for win rates
export function RiskProfileChart({ data }: { data: RiskProfileData[] }) {
    const maxTrades = Math.max(...data.map(d => d.trades), 1);

    return (
        <div className="space-y-3">
            {data.map((item) => (
                <div key={item.bucket} className="group">
                    <div className="flex justify-between text-xs mb-1">
                        <span className="font-mono text-zinc-400">${item.bucket}</span>
                        <span className="font-mono">
                            <span className={item.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'}>
                                {item.winRate}%
                            </span>
                            <span className="text-zinc-600 ml-2">({item.trades})</span>
                        </span>
                    </div>
                    <div className="h-2 bg-zinc-800 relative overflow-hidden">
                        {/* Total trades bar */}
                        <div
                            className="absolute h-full bg-zinc-700 transition-all duration-500"
                            style={{ width: `${(item.trades / maxTrades) * 100}%` }}
                        />
                        {/* Wins bar overlay */}
                        <div
                            className={`absolute h-full transition-all duration-500 ${item.winRate >= 50 ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                            style={{ width: `${(item.wins / maxTrades) * 100}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

// Speed profile with ROI indicators
export function SpeedProfileChart({ data }: { data: SpeedProfileData[] }) {
    return (
        <div className="space-y-4">
            {data.map((item) => (
                <div key={item.duration} className="flex items-center justify-between">
                    <span className="font-mono text-sm text-zinc-400 w-16">{item.duration}</span>
                    <div className="flex-1 mx-4 h-1 bg-zinc-800 relative">
                        <div
                            className={`absolute h-full ${item.avgROI >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            style={{
                                width: `${Math.min(Math.abs(item.avgROI), 100)}%`,
                                left: item.avgROI >= 0 ? '50%' : `${50 - Math.min(Math.abs(item.avgROI), 50)}%`
                            }}
                        />
                        <div className="absolute left-1/2 w-[2px] h-3 -top-1 bg-zinc-600" />
                    </div>
                    <span className={`font-mono text-sm w-20 text-right ${item.avgROI >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {item.avgROI >= 0 ? '+' : ''}{item.avgROI}%
                    </span>
                    <span className="text-zinc-600 text-xs font-mono w-12 text-right">({item.count})</span>
                </div>
            ))}
        </div>
    );
}

// Simple line chart for PnL history (pure CSS)
export function PnLChart({ data }: { data: PnLHistoryData[] }) {
    if (data.length === 0) {
        return <div className="text-zinc-600 text-sm font-mono text-center py-8">No history yet</div>;
    }

    const values = data.map(d => d.cumulativePnL);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const latestPnL = values[values.length - 1] || 0;
    const isPositive = latestPnL >= 0;

    return (
        <div>
            {/* Current total */}
            <div className={`text-3xl font-light mb-4 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? '+' : ''}${latestPnL.toFixed(2)}
            </div>

            {/* Chart */}
            <div className="h-24 flex items-end gap-1">
                {data.map((item, i) => {
                    const height = ((item.cumulativePnL - min) / range) * 100;
                    return (
                        <div
                            key={item.date}
                            className="flex-1 group relative"
                            style={{ minWidth: '4px' }}
                        >
                            <div
                                className={`w-full transition-all duration-300 ${item.cumulativePnL >= 0 ? 'bg-emerald-500/60' : 'bg-rose-500/60'} group-hover:opacity-100 opacity-80`}
                                style={{ height: `${Math.max(height, 2)}%` }}
                            />
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black border border-zinc-700 px-2 py-1 text-xs whitespace-nowrap z-10">
                                <div className="text-zinc-400">{item.date}</div>
                                <div className={item.cumulativePnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                    ${item.cumulativePnL.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Date range */}
            <div className="flex justify-between text-xs text-zinc-600 font-mono mt-2">
                <span>{data[0]?.date}</span>
                <span>{data[data.length - 1]?.date}</span>
            </div>
        </div>
    );
}
