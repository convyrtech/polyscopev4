'use client';

import { useState } from 'react';
import { WhalePopover } from './whale-popover';

// Minimum volume to show funding icons (filter out noise)
const MIN_VOLUME_FOR_FUNDING_ICON = 100;

// Signal Interface
export interface Signal {
    id: string;
    timestamp: string;
    marketSlug: string;
    outcome: string;
    side: string;
    amountUSD: number;
    aiScore: number;
    tags: string;
    whaleAddress: string;
    whale: {
        alias: string | null;
        tags: string | null;
        winrate: number;
        pnl: number;
        fundingSourceTag: string | null;
    };
}

// Tooltip Component
const Tooltip = ({ children, text }: { children: React.ReactNode; text: string }) => {
    const [show, setShow] = useState(false);
    
    return (
        <div className="relative inline-block">
            <div
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            >
                {children}
            </div>
            {show && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-zinc-800 text-zinc-300 rounded whitespace-nowrap border border-zinc-700">
                    {text}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800"></div>
                </div>
            )}
        </div>
    );
};

// Helper: Format time as HH:mm:ss
const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
    });
};

// Helper: Truncate Address (0x1234...abcd)
const truncateAddress = (addr: string) => {
    if (!addr) return 'Anonymous';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

// Helper: Get whale rank icon based on tags
const getWhaleRankIcon = (whale: Signal['whale']): { icon: string; tooltip: string } => {
    const tags = whale.tags?.toLowerCase() || '';
    
    if (tags.includes('sniper')) return { icon: '🎯', tooltip: 'Sniper - High Win Rate' };
    if (tags.includes('shark')) return { icon: '🦈', tooltip: 'Shark - Profitable Trader' };
    if (tags.includes('leviathan')) return { icon: '🐋', tooltip: 'Leviathan - Mega Whale' };
    if (tags.includes('hamster')) return { icon: '🐹', tooltip: 'Hamster - Poor Performance' };
    
    // Fresh wallet detection
    if (whale.winrate === 0 && whale.pnl === 0) return { icon: '🌱', tooltip: 'Fresh Wallet - New Trader' };
    
    // Insider tag
    if (tags.includes('insider') || tags.includes('smart')) return { icon: '👁️', tooltip: 'Possible Insider' };
    
    return { icon: '', tooltip: '' };
};

// Helper: Get funding source indicator
const getFundingIndicator = (fundingTag: string | null): { icon: string; tooltip: string; color: string } => {
    if (!fundingTag || fundingTag === 'UNKNOWN') {
        return { icon: '', tooltip: '', color: '' };
    }
    
    switch (fundingTag) {
        case 'SUSPICIOUS_INSIDER':
            return { 
                icon: '🌪️', 
                tooltip: '⚠️ Funded via Mixer (Tornado/Railgun)', 
                color: 'text-rose-400' 
            };
        case 'RETAIL':
            return { 
                icon: '🏦', 
                tooltip: 'CEX Funded (Binance/Coinbase)', 
                color: 'text-zinc-500' 
            };
        case 'BRIDGE':
            return { 
                icon: '🌉', 
                tooltip: 'Bridge User (Cross-chain)', 
                color: 'text-cyan-400' 
            };
        case 'WHALE':
            return { 
                icon: '💎', 
                tooltip: 'Known Whale Address', 
                color: 'text-amber-400' 
            };
        case 'PROTOCOL':
            return { 
                icon: '⚙️', 
                tooltip: 'DeFi Protocol User', 
                color: 'text-purple-400' 
            };
        default:
            return { icon: '', tooltip: '', color: '' };
    }
};

// Helper for Tier Colors
const getTierColor = (alias: string | null) => {
    if (!alias) return 'text-zinc-500';
    if (alias.includes('Leviathan')) return 'text-amber-400 font-bold';
    if (alias.includes('Shark')) return 'text-purple-400 font-semibold';
    if (alias.includes('Dolphin')) return 'text-cyan-400';
    return 'text-emerald-400';
};

export function SignalRow({ signal }: { signal: Signal }) {
    const rankInfo = getWhaleRankIcon(signal.whale);
    const fundingInfo = getFundingIndicator(signal.whale.fundingSourceTag);
    
    // Only show funding icons for significant volume trades
    const showFundingIcon = signal.amountUSD >= MIN_VOLUME_FOR_FUNDING_ICON && fundingInfo.icon;
    
    // Determine row highlight for suspicious funding
    const isSuspicious = signal.whale.fundingSourceTag === 'SUSPICIOUS_INSIDER';
    const rowClass = isSuspicious 
        ? 'bg-rose-950/20 border-rose-900/30 hover:bg-rose-950/30' 
        : 'hover:bg-zinc-900/20 border-zinc-900/30 hover:border-zinc-800';

    return (
        <div
            className={`grid grid-cols-12 gap-4 items-center py-4 border-b transition-all duration-200 group cursor-default ${rowClass}`}
        >
            {/* Time - HH:mm:ss format */}
            <div className="col-span-1 text-zinc-500 font-mono text-xs">
                {formatTime(signal.timestamp)}
            </div>

            {/* Whale / Actor with Funding Indicator - CLICKABLE WITH POPOVER */}
            <div className="col-span-2 flex items-center gap-2">
                {/* Funding Source Icon (only for significant volume) */}
                {showFundingIcon && (
                    <Tooltip text={fundingInfo.tooltip}>
                        <span className={`text-sm ${fundingInfo.color} cursor-help`}>
                            {fundingInfo.icon}
                        </span>
                    </Tooltip>
                )}
                
                {/* Suspicious dot indicator */}
                {isSuspicious && (
                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                )}
                
                {/* Address/Alias - Wrapped in Popover */}
                <WhalePopover address={signal.whaleAddress}>
                    <span className={`font-mono text-xs uppercase tracking-wider truncate cursor-pointer hover:underline ${getTierColor(signal.whale.alias)}`}>
                        {signal.whale.alias || truncateAddress(signal.whaleAddress)}
                    </span>
                </WhalePopover>
            </div>

            {/* Whale Rank Icon */}
            <div className="col-span-1 text-center">
                {rankInfo.icon ? (
                    <Tooltip text={rankInfo.tooltip}>
                        <span className="text-lg cursor-help">{rankInfo.icon}</span>
                    </Tooltip>
                ) : (
                    <span className="text-zinc-700">—</span>
                )}
            </div>

            {/* Market */}
            <div className="col-span-3 text-zinc-300 font-sans text-sm truncate pr-2" title={signal.marketSlug}>
                {signal.marketSlug.replace(/-/g, ' ')}
            </div>

            {/* Outcome + Type */}
            <div className="col-span-2">
                <span className={`font-mono text-sm font-medium ${signal.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {signal.side === 'BUY' ? '▲' : '▼'}
                </span>
                <span className="ml-2 text-zinc-300 text-sm">
                    {signal.outcome || 'Yes'}
                </span>
            </div>

            {/* Size */}
            <div className="col-span-1 text-right text-white font-mono text-sm">
                ${signal.amountUSD >= 1000 
                    ? `${(signal.amountUSD / 1000).toFixed(1)}k` 
                    : signal.amountUSD.toFixed(0)}
            </div>

            {/* AI Score (Bar) */}
            <div className="col-span-2 flex items-center justify-end gap-2">
                <span className={`text-xs font-mono ${
                    signal.aiScore >= 80 ? 'text-amber-400' : 
                    signal.aiScore >= 50 ? 'text-emerald-500' : 'text-zinc-500'
                }`}>
                    {signal.aiScore}
                </span>
                <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all ${
                            signal.aiScore >= 80 ? 'bg-amber-400' : 
                            signal.aiScore >= 50 ? 'bg-emerald-500' : 'bg-zinc-600'
                        }`}
                        style={{ width: `${signal.aiScore}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

// Table Header Component
export function SignalTableHeader() {
    return (
        <div className="grid grid-cols-12 gap-4 border-b border-zinc-800 pb-4 text-zinc-500 text-xs uppercase tracking-[0.15em] font-semibold mb-2">
            <div className="col-span-1">Time</div>
            <div className="col-span-2">Whale</div>
            <div className="col-span-1 text-center">Rank</div>
            <div className="col-span-3">Market</div>
            <div className="col-span-2">Outcome</div>
            <div className="col-span-1 text-right">Size</div>
            <div className="col-span-2 text-right">AI Score</div>
        </div>
    );
}
