'use client';

import { useState } from 'react';

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
    _analyzed: boolean;
    _timestamp: string;
}

export function WalletSearch() {
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [dossier, setDossier] = useState<WhaleDossier | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!address.trim()) return;

        // Validate address format
        if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
            setError('Invalid Ethereum address format');
            return;
        }

        setLoading(true);
        setError(null);
        setDossier(null);

        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/whales/${address}`
            );
            
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to fetch wallet data');
            }

            const data = await res.json();
            setDossier(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const getRiskColor = (risk: string) => {
        switch (risk) {
            case 'HIGH_RISK': return 'text-rose-400 bg-rose-950/30 border-rose-900/50';
            case 'MEDIUM_RISK': return 'text-amber-400 bg-amber-950/30 border-amber-900/50';
            case 'LOW_RISK': return 'text-emerald-400 bg-emerald-950/30 border-emerald-900/50';
            default: return 'text-zinc-400 bg-zinc-900/30 border-zinc-800';
        }
    };

    const getFundingColor = (tag: string) => {
        switch (tag) {
            case 'SUSPICIOUS_INSIDER': return 'text-rose-400';
            case 'RETAIL': return 'text-zinc-500';
            case 'BRIDGE': return 'text-cyan-400';
            case 'WHALE': return 'text-amber-400';
            default: return 'text-zinc-600';
        }
    };

    return (
        <div className="mb-12">
            {/* Search Input */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        placeholder="Enter wallet address (0x...)"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded px-4 py-3 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    />
                    {loading && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                </div>
                <button
                    onClick={handleSearch}
                    disabled={loading || !address.trim()}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-mono text-sm uppercase tracking-wider transition-all border border-emerald-500 disabled:border-zinc-700"
                >
                    {loading ? 'Scanning...' : 'Check Wallet'}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 bg-rose-950/30 border border-rose-900/50 text-rose-400 text-sm mb-6">
                    ❌ {error}
                </div>
            )}

            {/* Dossier Card */}
            {dossier && (
                <div className="border border-zinc-800 bg-zinc-900/30 p-6 space-y-6">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-3xl">{dossier.funding.icon}</span>
                                <div>
                                    <h3 className="text-white font-mono text-lg">
                                        {dossier.alias || `${dossier.address.slice(0, 8)}...${dossier.address.slice(-6)}`}
                                    </h3>
                                    <p className="text-zinc-500 font-mono text-xs">{dossier.address}</p>
                                </div>
                            </div>
                        </div>
                        <div className={`px-3 py-1 border text-xs font-mono uppercase ${getRiskColor(dossier.riskLevel)}`}>
                            {dossier.riskLevel.replace('_', ' ')}
                        </div>
                    </div>

                    {/* Tags */}
                    {dossier.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {dossier.tags.map(tag => (
                                <span key={tag} className="px-2 py-1 bg-zinc-800 text-zinc-400 text-xs font-mono">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-zinc-900/50 border border-zinc-800">
                            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Total Trades</p>
                            <p className="text-white text-2xl font-light">{dossier.stats.totalTrades}</p>
                        </div>
                        <div className="p-4 bg-zinc-900/50 border border-zinc-800">
                            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Win Rate</p>
                            <p className={`text-2xl font-light ${dossier.stats.winrate >= 60 ? 'text-emerald-400' : dossier.stats.winrate >= 40 ? 'text-zinc-300' : 'text-rose-400'}`}>
                                {dossier.stats.winrate.toFixed(1)}%
                            </p>
                        </div>
                        <div className="p-4 bg-zinc-900/50 border border-zinc-800">
                            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">PnL</p>
                            <p className={`text-2xl font-light ${dossier.stats.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {dossier.stats.pnl >= 0 ? '+' : ''}${dossier.stats.pnl.toFixed(2)}
                            </p>
                        </div>
                        <div className="p-4 bg-zinc-900/50 border border-zinc-800">
                            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">W/L Record</p>
                            <p className="text-white text-2xl font-light">
                                <span className="text-emerald-400">{dossier.stats.wins}</span>
                                <span className="text-zinc-600">/</span>
                                <span className="text-rose-400">{dossier.stats.losses}</span>
                            </p>
                        </div>
                    </div>

                    {/* Funding Intel */}
                    <div className="p-4 bg-zinc-950/50 border border-zinc-800">
                        <h4 className="text-zinc-500 text-xs uppercase tracking-wider mb-3">📡 Funding Intelligence</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-zinc-600 text-xs mb-1">Source Type</p>
                                <p className={`font-mono ${getFundingColor(dossier.funding.tag)}`}>
                                    {dossier.funding.icon} {dossier.funding.tag}
                                </p>
                            </div>
                            <div>
                                <p className="text-zinc-600 text-xs mb-1">Primary Source</p>
                                <p className="text-zinc-300 font-mono text-sm truncate" title={dossier.funding.source || 'Unknown'}>
                                    {dossier.funding.source 
                                        ? `${dossier.funding.source.slice(0, 12)}...${dossier.funding.source.slice(-8)}`
                                        : 'Unknown'
                                    }
                                </p>
                            </div>
                        </div>
                        
                        {/* Warning for suspicious */}
                        {dossier.funding.tag === 'SUSPICIOUS_INSIDER' && (
                            <div className="mt-4 p-3 bg-rose-950/30 border border-rose-900/50 text-rose-400 text-sm">
                                ⚠️ <strong>Warning:</strong> This wallet was funded via a privacy mixer (Tornado Cash, Railgun). 
                                This is a common pattern for insiders trying to hide their identity.
                            </div>
                        )}
                        
                        {dossier.funding.tag === 'RETAIL' && (
                            <div className="mt-4 p-3 bg-zinc-900/50 border border-zinc-800 text-zinc-400 text-sm">
                                ℹ️ This wallet was funded via a centralized exchange (CEX). 
                                Likely a retail trader with KYC exposure.
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-between items-center text-zinc-600 text-xs">
                        <span>
                            Last Active: {dossier.stats.lastActive 
                                ? new Date(dossier.stats.lastActive).toLocaleString() 
                                : 'Never'
                            }
                        </span>
                        <span>
                            Scanned: {new Date(dossier._timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
