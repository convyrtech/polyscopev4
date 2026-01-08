import React from 'react';

interface Strategy {
    id: string;
    name: string;
    status: string;
    config: any;
    totalPnL: number;
}

interface StrategyCardProps {
    strategy: Strategy;
    isSelected: boolean;
    onClick: () => void;
}

export function StrategyCard({ strategy, isSelected, onClick }: StrategyCardProps) {
    const formatCurrency = (val: number | null) => {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    };

    const getPnLColor = (val: number | null) => {
        if (!val) return 'text-zinc-500';
        return val > 0 ? 'text-emerald-400' : val < 0 ? 'text-rose-400' : 'text-zinc-300';
    };

    return (
        <div
            onClick={onClick}
            className={`
                p-6 transition-all cursor-pointer relative overflow-hidden group
                border bg-zinc-900/10
                ${isSelected
                    ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'border-zinc-900 hover:border-zinc-700'
                }
            `}
        >
            {/* Active Glow for Selected State */}
            {isSelected && (
                <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none" />
            )}

            <div className="flex justify-between items-start mb-4 relative z-10">
                <h3 className={`text-xl font-medium transition-colors ${isSelected ? 'text-emerald-400' : 'text-white'}`}>
                    {strategy.name}
                </h3>
                <span className={`text-xs px-2 py-1 uppercase tracking-wider ${strategy.status === 'ACTIVE' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                    {strategy.status}
                </span>
            </div>

            <div className="space-y-2 text-sm text-zinc-500 font-mono relative z-10">
                <div className="flex justify-between">
                    <span>TP: {strategy.config?.takeProfit ? `+${strategy.config.takeProfit * 100}%` : '-'}</span>
                    <span>SL: {strategy.config?.stopLoss ? `-${strategy.config.stopLoss * 100}%` : '-'}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-900 pt-2 mt-2">
                    <span className="group-hover:text-zinc-400 transition-colors">Total PnL:</span>
                    <span className={getPnLColor(strategy.totalPnL)}>{formatCurrency(strategy.totalPnL)}</span>
                </div>
            </div>
        </div>
    );
}
