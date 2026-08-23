import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/auth-provider'
import { QueryProvider } from '@/components/query-provider'
import { ToastProvider } from '@/components/ui/toast'
import { ThemeProvider } from '@/components/theme-provider'

const space = Space_Grotesk({ subsets: ['latin'], variable: '--font-space', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'Residency — Community management',
  description: 'Manage residency complaints, notices, and community operations.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${space.variable} ${mono.variable} ${inter.variable}`} suppressHydrationWarning>
        <div className="scanlines" aria-hidden="true" />
        <ThemeProvider>
          <AuthProvider>
            <QueryProvider>
              <ToastProvider>{children}</ToastProvider>
            </QueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}