import { Link } from 'react-router-dom'
import StatTile from '../components/StatTile'
import StatusPill from '../components/StatusPill'
import { companies } from '../data/companies'
import { fmtCurrency, fmtDate, personCongressionalSummary } from '../lib/portfolio'

const ASSET_TYPE_LABEL = {
  stock: 'Stock',
  option: 'Option',
  'real estate': 'Real estate',
  'business/fund interest': 'Business/fund interest',
  'mutual fund': 'Mutual fund',
  'private stock': 'Private stock',
  'government security': 'Government security',
}
// A few rows' raw asset name is PDF-extraction noise (adjacent-row text with
// no real delimiter) rather than a usable name — fall back to the ticker.
const GENERIC_NAME_RE = /^(?:units?|common stock,?|class [a-z] common stock,?)$/i

/** Congressional STOCK Act disclosures span two different filing types with
 * different shapes: Periodic Transaction Reports (dollar-range trades, never
 * a resulting position size) and the Annual Financial Disclosure Report
 * (a once-a-year full asset schedule that DOES report real holdings, also as
 * dollar ranges). The portfolio view below is built from the latter. */
export default function CongressionalDetail({ person }) {
  const trades = person.congressionalTrades ?? []
  const summary = personCongressionalSummary(person.id)
  const annual = person.annualAssetDisclosure
  const holdings = (annual?.holdings ?? [])
    .slice()
    .sort((a, b) => (b.valueHigh ?? b.valueLow ?? 0) - (a.valueHigh ?? a.valueLow ?? 0))

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
        Source: two real House Clerk STOCK Act filing systems — Periodic Transaction Reports (individual trades, as
        dollar <strong>ranges</strong>, never a resulting position size) and, once a year, an{' '}
        <strong>Annual Financial Disclosure Report</strong> with a full asset schedule that does report real
        holdings — also as disclosed ranges, since that's what the law requires. "Spouse" entries are real, publicly
        disclosed positions/transactions held or made by the member's spouse, not the member themself.
      </div>

      {annual && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Disclosed portfolio"
            value={`${fmtCurrency(annual.lowTotal)} – ${fmtCurrency(annual.highTotal)}`}
            sublabel={`${holdings.length} assets, as of ${annual.filingYear} annual report`}
          />
          <StatTile
            label="Filed"
            value={fmtDate(annual.filedDate)}
            sublabel={
              <a href={annual.filingUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                Real filing (PDF) ↗
              </a>
            }
          />
          <StatTile label="Asset types" value={new Set(holdings.map((h) => h.assetType)).size} sublabel="stocks, real estate, funds, etc." />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Trades" value={summary.tradeCount} sublabel={`${summary.tickers.length} companies`} />
        <StatTile label="Buys" value={summary.buyCount} tone="good" />
        <StatTile label="Sells" value={summary.sellCount} tone="critical" />
        <StatTile
          label="Disclosed trade flow"
          value={`${fmtCurrency(summary.lowTotal)} – ${fmtCurrency(summary.highTotal)}`}
          sublabel="sum of all trade ranges, not a portfolio"
        />
      </div>

      {annual && holdings.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Disclosed portfolio ({annual.formType})
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Every asset reported on the {annual.filingYear} Annual Financial Disclosure Report's Schedule A — real
            estate, business/fund interests, and actual stock/option positions. Bank and money-market accounts are
            excluded as cash, not a position. Values are the <strong>disclosed range</strong>, not an exact figure.
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--gridline)' }}
                >
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reported value range</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => {
                  const company = h.ticker ? companies[h.ticker] : null
                  const displayName = company?.name ?? (GENERIC_NAME_RE.test(h.name) ? null : h.name) ?? h.ticker
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--gridline)' }} className="last:border-b-0">
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {h.ticker ?? displayName}
                        {h.ticker && displayName !== h.ticker && (
                          <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                            {displayName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {ASSET_TYPE_LABEL[h.assetType] ?? h.assetType}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {h.owner}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {h.valueLow == null ? 'None disclosed' : `${fmtCurrency(h.valueLow)} – ${fmtCurrency(h.valueHigh)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
