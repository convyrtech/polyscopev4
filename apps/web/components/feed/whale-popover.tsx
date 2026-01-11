'use client';

import { useState, useRef, useEffect } from 'react';

interface WhaleDossier {
    address: string;
    alias: string | null;
    tags: string[];
    riskLevel: string;
    funding: {
        source: string | null;
        tag: string;
        analyzedAt: string | null;
        icon: string;
    };
    stats: {
        totalTrades: number;
        wins: number;
        losses: number;
        winrate: number;
        pnl: number;
        lastActive: string | null;
    };
}

interface WhalePopoverProps {
    address: string;
    children: React.ReactNode;
}

export function WhalePopover({ address, children }: WhalePopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [dossier, setDossier] = useState<WhaleDossier | null>(null);
    const [error, setError] = useState<string | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
                triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const fetchDossier = async () => {
        if (dossier) return; // Already loaded

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/whales/${address}`
            );
            
            if (!res.ok) {
                throw new Error('Failed to fetch');
            }

            const data = await res.json();
            setDossier(data);
        } catch (e) {
            setError('Failed to load wallet data');
        } finally {
            setLoading(false);
        }
    };

    const handleClick = () => {
        setIsOpen(!isOpen);
        if (!isOpen) {
            fetchDossier();
        }
    };

    const getRiskBadgeClass = (risk: string) => {
        switch (risk) {
            case 'HIGH_RISK': return 'bg-rose-950/50 text-rose-400 border-rose-900/50';
            case 'MEDIUM_RISK': return 'bg-amber-950/50 text-amber-400 border-amber-900/50';
            case 'LOW_RISK': return 'bg-emerald-950/50 text-emerald-400 border-emerald-900/50';
            default: return 'bg-zinc-900/50 text-zinc-400 border-zinc-800';
        }
    };

    return (
        <div className="relative inline-block">
            {/* Trigger */}
            <div 
                ref={triggerRef}
                onClick={handleClick}
                className="cursor-pointer hover:opacity-80 transition-opacity"
            >
                {children}
            </div>

            {/* Popover */}
            {isOpen && (
                <div 
                    ref={popoverRef}
                    className="absolute z-50 left-0 top-full mt-2 w-72 bg-zinc-950 border border-zinc-800 shadow-xl shadow-black/50"
                >
                    {/* Loading State */}
                    {loading && (
                        <div className="p-4 flex items-center justify-center gap-2 text-zinc-500">
                            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs">Analyzing...</span>
                        </div>
                    )}

                    {/* Error State */}
                    {error && (
                        <div className="p-4 text-rose-400 text-xs">
                            ❌ {error}
                        </div>
                    )}

                    {/* Dossier Content */}
                    {dossier && !loading && (
                        <div className="p-4 space-y-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">{dossier.funding.icon}</span>
                                    <div>
                                        <p className="text-white font-mono text-sm">
                                            {dossier.alias || `${address.slice(0, 6)}...${address.slice(-4)}`}
                                        </p>
                                        <p className="text-zinc-600 font-mono text-xs">
                                            {dossier.funding.tag}
                                        </p>
                                    </div>
                                </div>
                                <span className={`px-2 py-0.5 text-xs font-mono border ${getRiskBadgeClass(dossier.riskLevel)}`}>
                                    {dossier.riskLevel.replace('_', ' ')}
                                </span>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-zinc-900/50 p-2 border border-zinc-800">
                                    <p className="text-zinc-500 text-[10px] uppercase">Trades</p>
                                    <p className="text-white font-mono text-sm">{dossier.stats.totalTrades}</p>
                                </div>
                                <div className="bg-zinc-900/50 p-2 border border-zinc-800">
                                    <p className="text-zinc-500 text-[10px] uppercase">Win%</p>
                                    <p className={`font-mono text-sm ${dossier.stats.winrate >= 60 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                                        {dossier.stats.winrate.toFixed(0)}%
                                    </p>
                                </div>
                                <div className="bg-zinc-900/50 p-2 border border-zinc-800">
                                    <p className="text-zinc-500 text-[10px] uppercase">PnL</p>
                                    <p className={`font-mono text-sm ${dossier.stats.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        ${Math.abs(dossier.stats.pnl) >= 1000 
                                            ? `${(dossier.stats.pnl / 1000).toFixed(1)}k`
                                            : dossier.stats.pnl.toFixed(0)
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Tags */}
                            {dossier.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {dossier.tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] font-mono">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Warning */}
                            {dossier.funding.tag === 'SUSPICIOUS_INSIDER' && (
                                <div className="p-2 bg-rose-950/30 border border-rose-900/50 text-rose-400 text-[10px]">
                                    ⚠️ Mixer-funded wallet - possible insider
                                </div>
                            )}

                            {/* Footer */}
                            <div className="pt-2 border-t border-zinc-800 text-zinc-600 text-[10px] flex justify-between">
                                <span>W/L: {dossier.stats.wins}/{dossier.stats.losses}</span>
                                <a 
                                    href={`https://polygonscan.com/address/${address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-500 hover:text-emerald-400"
                                >
                                    View on Explorer →
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
