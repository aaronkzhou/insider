import { NavLink, Outlet } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

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
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold text-white"
              style={{ background: 'var(--accent)' }}
            >
              I
            </span>
            <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              INSIDER DESK
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
        Illustrative mock data for UI demonstration purposes only — not real SEC filings or investment advice.
      </footer>
    </div>
  )
}
