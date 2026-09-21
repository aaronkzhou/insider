import { useEffect, useState } from 'react'

function getInitialTheme() {
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore (private browsing, etc.)
  }
  return 'dark'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // ignore
    }
  }, [theme])

  const toggle = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      title="Toggle theme"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: theme === 'dark' ? 'var(--accent)' : 'var(--status-warning)' }}
      />
      {theme === 'dark' ? 'Dark' : 'Light'}
    </button>
  )
}
