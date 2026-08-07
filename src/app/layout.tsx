import type { Metadata } from 'next'
import './globals.css'
import { AdminAuthProvider } from '@/lib/admin-auth'
import Link from 'next/link'
import { Keyboard, Shield, Trophy } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Techmanthan Pro - Enterprise Speed Typing Platform',
  description: 'High-performance speed typing competition platform for schools and organizations',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AdminAuthProvider>
          <div className="min-h-screen flex flex-col items-center">
            {/* SaaS Navbar Header */}
            <header className="w-full border-b border-white/10 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-40">
              <div className="max-w-7xl mx-auto px-4 md:px-8 py-3.5 flex items-center justify-between">
                {/* Brand Logo */}
                <Link href="/" className="flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-amber-500 p-0.5 shadow-[0_0_15px_rgba(226,183,20,0.4)] group-hover:scale-105 transition-transform">
                    <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                      <Keyboard className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                  <div>
                    <div className="font-extrabold text-lg text-white tracking-tight flex items-center gap-2">
                      Techmanthan <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-mono border border-primary/30">PRO</span>
                    </div>
                    <div className="text-[10px] text-foreground/50 tracking-wider uppercase font-semibold">Speed Typing SaaS</div>
                  </div>
                </Link>

                {/* Status Ticker Badge */}
                <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-white/10 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-foreground/70 font-medium">Live Competitions Active</span>
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
            <footer className="w-full border-t border-white/5 py-6 text-center text-xs text-foreground/40 font-medium">
              Techmanthan Pro • High-Performance SaaS Competition Engine • Built for 80+ Concurrent Students
            </footer>
          </div>
        </AdminAuthProvider>
      </body>
    </html>
  )
}
