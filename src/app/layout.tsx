import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Techmanthan 6.0 Pro - Speed Typing Platform',
  description: 'Professional Speed Typing Competition Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <main className="min-h-screen p-4 md:p-8 flex flex-col items-center">
          <header className="mb-8 w-full max-w-6xl text-center">
            <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent uppercase tracking-wider drop-shadow-[0_0_15px_rgba(226,183,20,0.4)]">
              Speed Typing Platform
            </h1>
            <h2 className="text-xl text-foreground mt-2">Techmanthan 6.0 Pro</h2>
          </header>
          {children}
        </main>
      </body>
    </html>
  )
}
