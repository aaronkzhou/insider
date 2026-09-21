import { Link } from 'react-router-dom'
import StatTile from '../components/StatTile'
import StatusPill from '../components/StatusPill'
import { fmtCurrency, fmtDate, personCongressionalSummary } from '../lib/portfolio'

/** Congressional STOCK Act disclosures — a different filing system than SEC
 * Form 4, with a different shape: dollar RANGES, no resulting position size,
 * so no portfolio value. Kept as its own view rather than forcing this data
 * into the SEC-shaped page. */
export default function CongressionalDetail({ person }) {
  const trades = person.congressionalTrades ?? []
  const summary = personCongressionalSummary(person.id)

  return (
    <div>
      <Link to="/people" className="mb-4 inline-flex text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        ← Back to people
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {person.initials}
        </div>
        <div>
          <h1 className="text-xl font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            {person.name}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {person.title}
          </p>
        </div>
      </div>

      <div
        className="mb-6 rounded-lg border p-3 text-xs"
        style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      >
        Source: real Periodic Transaction Reports (STOCK Act) from the House Clerk's public financial disclosure
        system — a different filing system than SEC Form 4. Amounts are the <strong>disclosed range</strong>, not an
        exact figure (that's what the law requires), and PTRs don't report a resulting position size, so no
        portfolio value can be computed here. "Spouse" trades are real, publicly disclosed transactions made by the
        member's spouse, not the member themself.
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Trades" value={summary.tradeCount} sublabel={`${summary.tickers.length} companies`} />
        <StatTile label="Buys" value={summary.buyCount} tone="good" />
        <StatTile label="Sells" value={summary.sellCount} tone="critical" />
        <StatTile
          label="Disclosed range total"
          value={`${fmtCurrency(summary.lowTotal)} – ${fmtCurrency(summary.highTotal)}`}
          sublabel="sum of all trade ranges"
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
        Transaction history
      </h2>
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr
              className="text-left text-xs uppercase tracking-wide"
              style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--gridline)' }}
            >
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Amount range</th>
              <th className="px-4 py-2.5 font-medium">Description</th>
              <th className="px-4 py-2.5 text-right font-medium">Date</th>
              <th className="px-4 py-2.5 text-right font-medium">Filing</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr
                key={`${t.docId}-${i}`}
                style={{ borderBottom: '1px solid var(--gridline)' }}
                className="last:border-b-0 transition-colors hover:bg-[var(--surface-2)]"
              >
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t.owner}
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t.ticker ?? '—'}
                  </span>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t.asset}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill type={t.type === 'exchange' ? 'buy' : t.type} />
                </td>
                <td className="px-4 py-2.5 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {fmtCurrency(t.amountLow)} – {fmtCurrency(t.amountHigh)}
                </td>
                <td
                  className="max-w-[240px] overflow-hidden px-4 py-2.5 text-xs"
                  style={{ color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                  title={t.description ?? undefined}
                >
                  {t.description ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {fmtDate(t.date)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {t.filingUrl && (
                    <a
                      href={t.filingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      PTR ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
