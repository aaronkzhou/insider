import { Link } from 'react-router-dom'
import { getPerson } from '../data/people'
import { companies } from '../data/companies'
import { detectClusters, fmtCurrency, fmtDate, fmtShares } from '../lib/portfolio'
import StatusPill from './StatusPill'

export default function ClusterActivity({ windowDays = 5, limit = 6 }) {
  const clusters = detectClusters(windowDays).slice(0, limit)

  if (clusters.length === 0) {
    return (
      <div
        className="rounded-lg border p-6 text-center text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        No two or more insiders traded the same stock, same direction, within {windowDays} days of each other in the current data.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {clusters.map((c) => {
        const company = companies[c.ticker]
        const spanDays = Math.round((new Date(c.endDate) - new Date(c.startDate)) / 86_400_000)
        return (
          <div
            key={`${c.ticker}-${c.type}-${c.startDate}`}
            className="rounded-lg border p-4"
            style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {c.ticker}
                </span>
                <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {company?.name}
                </span>
              </div>
              <StatusPill type={c.type} />
            </div>

            <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {c.personIds.length} insiders · {fmtDate(c.startDate)}
              {spanDays > 0 ? ` – ${fmtDate(c.endDate)}` : ''}
            </div>

            <div className="mt-3 space-y-1">
              {c.personIds.map((personId) => {
                const person = getPerson(personId)
                return (
                  <Link
                    key={personId}
                    to={`/people/${personId}`}
                    className="block truncate text-sm font-medium hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {person?.name ?? personId}
                  </Link>
                )
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs" style={{ borderColor: 'var(--gridline)' }}>
              <span style={{ color: 'var(--text-muted)' }}>{fmtShares(c.totalShares)} sh combined</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {fmtCurrency(c.totalValue)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
