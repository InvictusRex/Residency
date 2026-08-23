import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/auth-provider'
import { QueryProvider } from '@/components/query-provider'
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' })
export const metadata: Metadata = { title: 'Residency — Community management', description: 'Manage residency complaints, notices, and community operations.' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className="bg-background"><body className={`${geist.variable} ${mono.variable}`}><AuthProvider><QueryProvider>{children}</QueryProvider></AuthProvider></body></html> }
