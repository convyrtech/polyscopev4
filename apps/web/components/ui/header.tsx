'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Header() {
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path;
    const linkClass = (path: string) => `
        transition-all uppercase font-mono tracking-widest text-sm md:text-base px-6 py-2 border
        whitespace-nowrap
        ${isActive(path)
            ? 'text-emerald-400 border-emerald-400 bg-emerald-900/10 shadow-[0_0_15px_rgba(52,211,153,0.2)]'
            : 'text-zinc-500 border-zinc-800 hover:text-white hover:border-zinc-600 hover:bg-zinc-900/40'
        }
    `;

    return (
        <header className="mb-12 md:mb-24 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
                <h1 className="text-4xl md:text-7xl lg:text-9xl font-light tracking-tighter mb-2 uppercase text-white">
                    Whale<span className="text-zinc-600">Scope</span>
                </h1>
                <div className="flex items-center gap-4">
                    <div className="h-[2px] w-8 md:w-12 bg-zinc-800"></div>
                    <p className="text-zinc-500 text-sm md:text-xl tracking-widest uppercase">
                        Polymarket Shadow Feed
                    </p>
                </div>
            </div>

            {/* NAVIGATION */}
            <nav className="flex items-center gap-4 md:gap-6">
                <Link href="/" className={linkClass('/')}>
                    [ Feed ]
                </Link>
                <Link href="/strategies" className={linkClass('/strategies')}>
                    [ Strategies ]
                </Link>
            </nav>
        </header>
    );
}
