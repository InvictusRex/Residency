'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { useTheme } from '@/components/theme-provider'
import { Icon } from '@/components/ui/icon'

type NavItem = { href: string; label: string; icon: string; admin?: boolean; resident?: boolean }

const adminNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', admin: true },
  { href: '/complaints', label: 'Complaints', icon: 'report_problem', admin: true },
  { href: '/admin/notices', label: 'Notices', icon: 'campaign', admin: true },
  { href: '/admin/categories', label: 'Categories', icon: 'category', admin: true },
  { href: '/admin/residents', label: 'Residents', icon: 'groups', admin: true },
  { href: '/admin/settings', label: 'Settings', icon: 'settings', admin: true },
  { href: '/profile', label: 'Profile', icon: 'account_circle' },
]

const residentNav: NavItem[] = [
  { href: '/my-complaints', label: 'My Complaints', icon: 'report_problem', resident: true },
  { href: '/my-complaints/new', label: 'Create Complaint', icon: 'add_circle', resident: true },
  { href: '/notices', label: 'Notices', icon: 'campaign' },
]

function ThemeSwitch() {
  const { theme, toggle } = useTheme()
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      <button
        className={`theme-segment${theme === 'dark' ? ' active' : ''}`}
        onClick={() => theme !== 'dark' && toggle()}
        aria-pressed={theme === 'dark'}
      >
        <Icon name="dark_mode" size={16} />
        Dark
      </button>
      <button
        className={`theme-segment${theme === 'light' ? ' active' : ''}`}
        onClick={() => theme !== 'light' && toggle()}
        aria-pressed={theme === 'light'}
      >
        <Icon name="light_mode" size={16} />
        Light
      </button>
    </div>
  )
}

function SignOutButton() {
  const { signOut } = useAuth()
  const router = useRouter()
  return (
    <button
      className="outline"
      style={{ width: '100%' }}
      onClick={() => {
        signOut()
        router.replace('/login')
      }}
    >
      <Icon name="logout" size={16} />
      Logout
    </button>
  )
}

function TopbarSignOut() {
  const { signOut } = useAuth()
  const router = useRouter()
  return (
    <button
      className="topnav-link"
      style={{ border: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      onClick={() => {
        signOut()
        router.replace('/login')
      }}
      aria-label="Logout"
    >
      <Icon name="logout" size={17} />
      Logout
    </button>
  )
}

export function Shell({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, loading } = useAuth()
  const [mobile, setMobile] = useState(false)
  const [residentMenu, setResidentMenu] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user && pathname !== '/login' && pathname !== '/register') {
      router.replace('/login')
    }
  }, [loading, user, pathname, router])

  if (loading) return <div className="loading-screen">Loading session…</div>
  if (!user) return <div className="loading-screen">Checking access…</div>

  const isAdmin = user.role === 'ADMIN'
  const nav = (isAdmin ? adminNav : residentNav).filter((n) => {
    if (n.admin && !isAdmin) return false
    if (n.resident && isAdmin) return false
    return true
  })

  if (!isAdmin) {
    return (
      <div className="residency-app" style={{ display: 'block' }}>
        <nav className="topnav">
          <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
            <span className="topnav-brand" style={{ display: 'flex', alignItems: 'center' }}>
              Residency
            </span>
            <div className="topnav-links">
              {nav.map(({ href, label }) => (
                <button
                  key={href}
                  className={pathname === href || (href !== '/my-complaints' && pathname.startsWith(href)) ? 'topnav-link active' : 'topnav-link'}
                  onClick={() => router.push(href)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="topnav-right">
            <ThemeSwitch />
            <TopbarSignOut />
            <button
              className="menu-btn"
              onClick={() => setResidentMenu((v) => !v)}
              aria-label="Open menu"
              aria-expanded={residentMenu}
            >
              <Icon name="menu" size={22} />
            </button>
            <button
              className="topnav-avatar"
              onClick={() => router.push('/profile')}
              aria-label="Profile"
              title={user.name}
            >
              {user.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </nav>
        {residentMenu && (
          <div
            style={{
              position: 'fixed',
              top: 64,
              left: 0,
              right: 0,
              zIndex: 39,
              background: 'var(--surface-deep)',
              borderBottom: '1px solid var(--border)',
              padding: 10,
              display: 'grid',
              gap: 4,
            }}
          >
            {nav.map(({ href, label }) => (
              <button
                key={href}
                className="nav-item"
                onClick={() => {
                  setResidentMenu(false)
                  router.push(href)
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="content" style={{ paddingTop: 92 }}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="residency-app">
      <aside className={mobile ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-header">
          <div className="side-avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="side-name">{user.name}</div>
            <div className="side-role">{user.role === 'ADMIN' ? 'Community Manager' : user.role}</div>
          </div>
          <button className="close-nav" onClick={() => setMobile(false)} aria-label="Close menu">
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="nav">
          {nav.map(({ href, label, icon }) => (
            <button
              key={href}
              className={pathname === href ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setMobile(false)
                router.push(href)
              }}
            >
              <Icon name={icon} size={20} />
              {label}
            </button>
          ))}
        </nav>

        <div className="side-footer">
          <button className="primary side-cta" onClick={() => router.push('/admin/notices')}>
            <Icon name="add" size={18} />
            New Notice
          </button>
          <ThemeSwitch />
          <SignOutButton />
        </div>
      </aside>
      {mobile && <button className="scrim" onClick={() => setMobile(false)} aria-label="Close navigation" />}
      <main className="main">
        <header>
          <button className="menu-btn" onClick={() => setMobile(true)} aria-label="Open menu">
            <Icon name="menu" size={22} />
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