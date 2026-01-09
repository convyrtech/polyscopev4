'use client';

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface RiskProfileData {
    bucket: string;
    trades: number;
    wins: number;
    winRate: number;
}

interface SpeedProfileData {
    duration: string;
    avgPnL: number;
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
                <div key={item.bucket}>
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
                        <div
                            className="absolute h-full bg-zinc-700 transition-all duration-500"
                            style={{ width: `${(item.trades / maxTrades) * 100}%` }}
                        />
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

// Speed profile with vertical layout (label + bar stacked)
export function SpeedProfileChart({ data }: { data: SpeedProfileData[] }) {
    const maxPnL = Math.max(...data.map(d => Math.abs(d.avgPnL)), 10);

    return (
        <div className="space-y-4">
            {data.map((item) => (
                <div key={item.duration} className="space-y-1">
                    {/* Label row */}
                    <div className="flex justify-between text-xs">
                        <span className="font-mono text-zinc-400">{item.duration}</span>
                        <span className="font-mono">
                            <span className={item.avgPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {item.avgPnL >= 0 ? '+' : ''}${Math.abs(item.avgPnL).toFixed(2)}
                            </span>
                            <span className="text-zinc-600 ml-2">({item.count})</span>
                        </span>
                    </div>
                    {/* Bar */}
                    <div className="h-2 bg-zinc-800 relative overflow-hidden">
                        <div
                            className={`absolute h-full transition-all duration-500 ${item.avgPnL >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            style={{
                                width: `${Math.min((Math.abs(item.avgPnL) / maxPnL) * 100, 100)}%`
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

// Recharts Area Chart for PnL history
export function PnLChart({ data }: { data: PnLHistoryData[] }) {
    if (data.length === 0) {
        return <div className="text-zinc-600 text-sm font-mono text-center py-8">No history yet</div>;
    }

    const latestPnL = data[data.length - 1]?.cumulativePnL || 0;
    const isPositive = latestPnL >= 0;

    return (
        <div>
            {/* Current total */}
            <div className={`text-3xl font-light mb-4 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? '+' : ''}${latestPnL.toFixed(2)}
            </div>

            {/* Recharts Area Chart */}
            <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                        <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0.1} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: '#52525b' }}
                        axisLine={{ stroke: '#27272a' }}
                        tickLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis hide />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#000',
                            border: '1px solid #3f3f46',
                            borderRadius: '0',
                            fontSize: '12px'
                        }}
                        labelStyle={{ color: '#71717a' }}
                        formatter={(value) => [`$${Number(value || 0).toFixed(2)}`, 'PnL']}
                    />
                    <Area
                        type="monotone"
                        dataKey="cumulativePnL"
                        stroke={isPositive ? '#10b981' : '#f43f5e'}
                        strokeWidth={2}
                        fill="url(#colorPnL)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

