'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Shield, Trophy } from 'lucide-react';

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTestPage = pathname?.startsWith('/test/');

  if (isTestPage) {
    // During the test — render ONLY the page content, no navbar/footer
    return (
      <div className="min-h-screen flex flex-col items-center">
        <main className="w-full max-w-7xl p-4 md:p-8 flex flex-col items-center flex-grow">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center">
      {/* SaaS Navbar Header */}
      <header className="w-full border-b border-white/10 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/30 shadow-[0_0_15px_rgba(226,183,20,0.4)] group-hover:scale-105 transition-transform bg-white">
              <img
                src="/logo.jpg"
                alt="College Logo"
                className="w-full h-full object-cover scale-105 animate-pulse"
                style={{ clipPath: 'circle(50%)' }}
              />
            </div>
            <div>
              <div className="font-extrabold text-lg text-white tracking-tight leading-none">
                Akshara Vega
              </div>
              <span className="text-[9px] font-mono text-primary font-bold tracking-widest uppercase">TYPING PLATFORM</span>
            </div>
          </Link>

          {/* Centered College Name */}
          <div className="hidden lg:flex flex-col items-center text-center mx-4">
            <span className="text-xs md:text-sm font-extrabold text-white tracking-wider">Dr.B.B.HEGDE FIRST GRADE COLLEGE</span>
            <span className="text-[9px] md:text-xs text-primary tracking-widest font-bold uppercase">KUNDAPURA</span>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-foreground/80 hover:text-white hover:bg-white/5 transition-colors font-medium"
            >
              <Trophy className="w-4 h-4 text-primary" /> Competitions
            </Link>
            <Link
              href="/admin"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-slate-950 hover:bg-yellow-400 transition-all shadow-[0_0_15px_rgba(226,183,20,0.3)] hover:scale-105"
            >
              <Shield className="w-4 h-4" /> Admin Portal
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-7xl p-4 md:p-8 flex flex-col items-center flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/5 py-6 text-center text-xs text-foreground/45 font-medium">
        Akshara Vega • Dr.B.B.HEGDE FIRST GRADE COLLEGE, Kundapura
      </footer>
    </div>
  );
}
