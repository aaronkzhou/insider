import { NavLink, Outlet } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import LogoMark from './LogoMark'

const navLinkClass =
  'border-b-2 px-1 py-1 text-[13px] font-semibold uppercase tracking-wide transition-colors'
const navLinkStyle = ({ isActive }) => ({
  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
  borderColor: isActive ? 'var(--accent)' : 'transparent',
})

export default function Layout() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-plane)' }}>
      <header
        className="sticky top-0 z-10 border-b"
        style={{ background: 'color-mix(in srgb, var(--page-plane) 88%, transparent)', backdropFilter: 'blur(10px)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2">
            <LogoMark size={28} />
            <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              PAPER TRAIL
            </span>
          </NavLink>

          <nav className="flex items-center gap-6">
            <NavLink to="/" end className={navLinkClass} style={navLinkStyle}>
              Dashboard
            </NavLink>
            <NavLink to="/people" className={navLinkClass} style={navLinkStyle}>
              People
            </NavLink>
          </nav>

          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-xs sm:px-6" style={{ color: 'var(--text-muted)' }}>
        Real transaction data sourced from public SEC EDGAR Form 4 filings. Not investment advice.
      </footer>
    </div>
  )
}
