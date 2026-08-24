'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api/client'
import type { User } from '@/lib/types'

type AuthContextValue = {
  user: User | null
  token: string | null
  loading: boolean
  signIn: (token: string, user: User, refreshToken?: string) => void
  signOut: () => void
}

const TOKEN_KEY = 'residency.token'
const REFRESH_KEY = 'residency.refresh'
const USER_KEY = 'residency.user'

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const restore = async () => {
      try {
        const saved = localStorage.getItem(TOKEN_KEY)
        if (!saved) return
        setToken(saved)
        try {
          const u = await api.me(saved)
          if (!active) return
          setUser(u)
          localStorage.setItem(USER_KEY, JSON.stringify(u))
        } catch {
          if (!active) return
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(REFRESH_KEY)
          localStorage.removeItem(USER_KEY)
          setToken(null)
        }
      } catch {
        if (active) setToken(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    restore()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const onRefreshed = () => {
      setToken(localStorage.getItem(TOKEN_KEY))
    }
    window.addEventListener('residency-token-refreshed', onRefreshed)
    return () => window.removeEventListener('residency-token-refreshed', onRefreshed)
  }, [])

  const signIn = useCallback((nextToken: string, nextUser: User, refreshToken?: string) => {
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
    setToken(nextToken)
    setUser(nextUser)
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, token, loading, signIn, signOut }), [user, token, loading, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}