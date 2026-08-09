import type { Metadata } from 'next'
import './globals.css'
import { AdminAuthProvider } from '@/lib/admin-auth'
import ConditionalShell from '@/components/ConditionalShell'

export const metadata: Metadata = {
  title: 'Akshara Vega - Dr.B.B.HEGDE FIRST GRADE COLLEGE, Kundapura',
  description: 'High-performance speed typing competition platform for Dr.B.B.HEGDE FIRST GRADE COLLEGE, Kundapura',
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
          <ConditionalShell>{children}</ConditionalShell>
        </AdminAuthProvider>
      </body>
    </html>
  )
}
