import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { people } from '../data/people'
import { companies } from '../data/companies'
import { fmtCurrency, fmtDate, personSummary } from '../lib/portfolio'

export default function PeopleList() {
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    return people
      .map((person) => ({ person, summary: personSummary(person.id) }))
      .filter(({ person }) => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        return (
          person.name.toLowerCase().includes(q) ||
          person.title.toLowerCase().includes(q) ||
          person.company.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.summary.portfolioValue - a.summary.portfolioValue)
  }, [search])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
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
        className="mb-5 w-full max-w-sm rounded-md border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ person, summary }) => {
          const primaryCompany = companies[person.company]
          const net = summary.buyValue - summary.sellValue
          return (
            <Link
              key={person.id}
              to={`/people/${person.id}`}
              className="rounded-lg border p-4 transition-colors hover:border-[var(--accent)]"
              style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  {person.initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {person.name}
                  </div>
                  <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                    {person.title} · {primaryCompany?.name}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Portfolio value</div>
                  <div className="mt-0.5 font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {fmtCurrency(summary.portfolioValue)}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Net activity</div>
                  <div
                    className="mt-0.5 font-semibold tabular-nums"
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
        })}
      </div>
    </div>
  )
}
