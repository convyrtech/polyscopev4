'use client';

import React from 'react';

interface TabsProps {
    tabs: string[];
    activeTab: string;
    onTabChange: (tab: string) => void;
    className?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, className = '' }: TabsProps) {
    return (
        <div className={`flex gap-1 ${className}`}>
            {tabs.map((tab) => {
                const isActive = tab === activeTab;
                return (
                    <button
                        key={tab}
                        data-testid={`tab-${tab}`}
                        onClick={() => onTabChange(tab)}
                        className={`
                            relative px-4 py-2 text-xs uppercase tracking-[0.15em] font-mono
                            transition-all duration-200
                            border
                            ${isActive
                                ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
                            }
                        `}
                    >
                        {/* Active glow effect */}
                        {isActive && (
                            <span className="absolute inset-0 bg-emerald-500/5 pointer-events-none" />
                        )}
                        [ {tab} ]
                    </button>
                );
            })}
        </div>
    );
}
