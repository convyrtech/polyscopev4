import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Header() {
    // We can use a simple check or pass 'active' prop, but usePathname is better if client component
    // To keep it server component friendly (if needed), we might just use simple links with conditional styling if we turn it into client component.
    // For now, let's keep it simple.

    return (
        <header className="mb-24 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
                <h1 className="text-6xl md:text-9xl font-light tracking-tighter mb-2 uppercase text-white">
                    Whale<span className="text-zinc-600">Scope</span>
                </h1>
                <div className="flex items-center gap-4">
                    <div className="h-[2px] w-12 bg-zinc-800"></div>
                    <p className="text-zinc-500 text-lg md:text-xl tracking-widest uppercase">
                        Polymarket Shadow Feed
                    </p>
                </div>
            </div>

            {/* NAVIGATION */}
            <nav className="flex items-center gap-8 text-xl uppercase tracking-[0.2em] font-light">
                <Link href="/" className="hover:text-emerald-400 transition-colors">
                    [ FEED ]
                </Link>
                <Link href="/strategies" className="hover:text-emerald-400 transition-colors">
                    [ STRATEGIES ]
                </Link>
            </nav>
        </header>
    );
}
