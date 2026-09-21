import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { people } from '../data/people'
import { companies } from '../data/companies'
import { fmtCurrency, fmtDate, personSummary } from '../lib/portfolio'

// Explicitly requested focus people — shown first, larger. Order is the
// order they appear. Everyone else still shows below, just more compact.
const FEATURED_IDS = [
  'musk-elon-4730', // Elon Musk
  'donald-j-trump-7033', // Donald J. Trump
  'donald-trump-jr-6181', // Donald Trump Jr.
  'thiel-peter-1060', // Peter Thiel
  'situational-awareness-lp-5724', // Leopold Aschenbrenner's fund
]

function matches(person, q) {
  if (!q) return true
  return (
    person.name.toLowerCase().includes(q) ||
    person.title.toLowerCase().includes(q) ||
    person.company?.toLowerCase().includes(q)
  )
}

export default function PeopleList() {
  const [search, setSearch] = useState('')

  const { featured, rest } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const withSummary = people
      .filter((p) => matches(p, q))
      .map((person) => ({ person, summary: personSummary(person.id) }))

    const featured = FEATURED_IDS.map((id) => withSummary.find((r) => r.person.id === id)).filter(Boolean)
    const featuredIds = new Set(featured.map((r) => r.person.id))
    const rest = withSummary
      .filter((r) => !featuredIds.has(r.person.id))
      .sort((a, b) => b.summary.portfolioValue - a.summary.portfolioValue)

    return { featured, rest }
  }, [search])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Insiders
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Executives and directors tracked, ranked by current portfolio value.
        </p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, title, or company…"
        className="mb-6 w-full max-w-sm rounded-md border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
      />

      {featured.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Featured
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {featured.map(({ person, summary }) => (
              <FeaturedCard key={person.id} person={person} summary={summary} />
            ))}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <>
          {featured.length > 0 && (
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              All insiders
            </h2>
          )}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rest.map(({ person, summary }) => (
              <CompactCard key={person.id} person={person} summary={summary} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FeaturedCard({ person, summary }) {
  const primaryCompany = companies[person.company]
  const net = summary.buyValue - summary.sellValue
  return (
    <Link
      to={`/people/${person.id}`}
      className="rounded-lg border p-5 transition-colors hover:border-[var(--accent)]"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border-strong)' }}
    >
      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-xl font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {person.initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {person.name}
          </div>
          <div className="truncate text-sm" style={{ color: 'var(--text-muted)' }}>
            {person.title}
            {primaryCompany && ` · ${primaryCompany.name}`}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Portfolio value
          </div>
          <div className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {fmtCurrency(summary.portfolioValue)}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Net activity
          </div>
          <div
            className="mt-0.5 text-xl font-bold tabular-nums"
            style={{ color: net >= 0 ? 'var(--status-good)' : 'var(--status-critical)' }}
          >
            {net >= 0 ? '+' : ''}
            {fmtCurrency(net)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>
          {summary.buyCount} buys · {summary.sellCount} sells
        </span>
        <span>Last: {fmtDate(summary.lastTradeDate)}</span>
      </div>
    </Link>
  )
}

function CompactCard({ person, summary }) {
  const net = summary.buyValue - summary.sellValue
  return (
    <Link
      to={`/people/${person.id}`}
      className="rounded-md border p-2.5 transition-colors hover:border-[var(--accent)]"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {person.initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {person.name}
          </div>
          <div className="truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {person.company ?? person.title}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {fmtCurrency(summary.portfolioValue)}
        </span>
        <span className="tabular-nums" style={{ color: net >= 0 ? 'var(--status-good)' : 'var(--status-critical)' }}>
          {net >= 0 ? '+' : ''}
          {fmtCurrency(net)}
        </span>
      </div>
    </Link>
  )
}
