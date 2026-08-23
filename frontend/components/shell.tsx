'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell,
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Tags,
  UserCircle,
  X,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; admin?: boolean; resident?: boolean }

const nav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, admin: true },
  { href: '/complaints', label: 'Complaints', icon: ClipboardList, admin: true },
  { href: '/my-complaints', label: 'My complaints', icon: ClipboardList, resident: true },
  { href: '/notices', label: 'Notices', icon: Bell },
  { href: '/admin/categories', label: 'Categories', icon: Tags, admin: true },
  { href: '/admin/notices', label: 'Notice management', icon: Bell, admin: true },
  { href: '/admin/settings', label: 'Settings', icon: Settings, admin: true },
  { href: '/profile', label: 'Profile', icon: UserCircle },
]

export function Shell({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, signOut, loading } = useAuth()
  const [mobile, setMobile] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user && pathname !== '/login' && pathname !== '/register') {
      router.replace('/login')
    }
  }, [loading, user, pathname, router])

  if (loading) return <div className="loading-screen">Loading session…</div>
  if (!user) return <div className="loading-screen">Checking access…</div>

  const allowed = nav.filter((n) => {
    if (n.admin && user.role !== 'ADMIN') return false
    if (n.resident && user.role !== 'RESIDENT') return false
    return true
  })

  return (
    <div className="residency-app">
      <aside className={mobile ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark">
            <Building2 size={17} />
          </div>
          <span>residency</span>
          <button className="close-nav" onClick={() => setMobile(false)} aria-label="Close menu">
            <X size={19} />
          </button>
        </div>
        <div className="workspace">
          <div className="workspace-icon">R</div>
          <div>
            <strong>Riverside Residency</strong>
            <small>Management portal</small>
          </div>
        </div>
        <p className="nav-label">Workspace</p>
        <nav>
          {allowed.map(({ href, label, icon: Icon }) => (
            <button
              key={href}
              className={pathname === href ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setMobile(false)
                router.push(href)
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>
          <button
            onClick={() => {
              signOut()
              router.replace('/login')
            }}
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button className="scrim" onClick={() => setMobile(false)} aria-label="Close navigation" />
      )}
      <main className="main">
        <header>
          <button className="menu-btn" onClick={() => setMobile(true)} aria-label="Open menu">
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <b>/</b>
            <strong>{title}</strong>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  )
}