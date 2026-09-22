import { Link } from 'react-router-dom'
import { getPerson } from '../data/people'
import { companies } from '../data/companies'
import { detectClusters, fmtCurrency, fmtDate, fmtShares } from '../lib/portfolio'
import StatusPill from './StatusPill'

const MAJOR_THRESHOLD = 4 // 4+ insiders moving together is the "highlight this" signal

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
      {clusters.map((c, i) => {
        const company = companies[c.ticker]
        const spanDays = Math.round((new Date(c.endDate) - new Date(c.startDate)) / 86_400_000)
        const isMajor = c.personIds.length >= MAJOR_THRESHOLD
        return (
          <div
            key={`${c.ticker}-${c.type}-${c.startDate}`}
            className={`rounded-lg border p-4 ${i === 0 && isMajor ? 'sm:col-span-2 lg:col-span-3' : ''}`}
            style={{
              background: 'var(--surface-1)',
              borderColor: isMajor ? 'var(--accent)' : 'var(--border)',
              borderWidth: isMajor ? 2 : 1,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {c.ticker}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {company?.name}
                </span>
                {isMajor && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ background: 'var(--accent)' }}
                  >
                    {c.personIds.length} insiders
                  </span>
                )}
              </div>
              <StatusPill type={c.type} />
            </div>

            <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {!isMajor && `${c.personIds.length} insiders · `}
              {fmtDate(c.startDate)}
              {spanDays > 0 ? ` – ${fmtDate(c.endDate)}` : ''}
            </div>

            <div className={`mt-3 ${i === 0 && isMajor ? 'grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3' : 'space-y-1.5'}`}>
              {c.personIds.map((personId) => {
                const person = getPerson(personId)
                // A person can appear more than once in the window — show each date they traded.
                const dates = c.txs.filter((t) => t.personId === personId).map((t) => t.date)
                return (
                  <Link
                    key={personId}
                    to={`/people/${personId}`}
                    className="block hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <div className="truncate text-sm font-medium">{person?.name ?? personId}</div>
                    <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      {dates.map((d) => fmtDate(d)).join(', ')}
                    </div>
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
