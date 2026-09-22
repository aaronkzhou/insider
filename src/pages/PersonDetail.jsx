import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPerson } from '../data/people'
import { companies } from '../data/companies'
import {
  fmtCurrency,
  fmtDate,
  fmtShares,
  personHoldings,
  personSummary,
  personTransactionsWithRunningTotal,
} from '../lib/portfolio'
import StatTile from '../components/StatTile'
import StatusPill from '../components/StatusPill'
import HoldingsChart from '../components/HoldingsChart'
import CongressionalDetail from './CongressionalDetail'

export default function PersonDetail() {
  const { id } = useParams()
  const person = getPerson(id)

  const holdings = useMemo(() => (person ? personHoldings(person.id) : []), [person])
  const summary = useMemo(() => (person ? personSummary(person.id) : null), [person])
  const history = useMemo(() => (person ? personTransactionsWithRunningTotal(person.id) : []), [person])

  if (!person) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Insider not found.{' '}
        <Link to="/people" className="underline" style={{ color: 'var(--accent)' }}>
          Back to people
        </Link>
      </div>
    )
  }

  // Congressional STOCK Act disclosures are a different filing system and
  // data shape (dollar ranges, no position size) — a separate page, not
  // forced into the SEC Form 4 layout.
  if (person.congressional) {
    return <CongressionalDetail person={person} />
  }

  const primaryCompany = companies[person.company]
  const net = summary.buyValue - summary.sellValue
  const otherRoles = Object.entries(person.roles ?? {}).filter(([ticker]) => ticker !== person.company)

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
            {person.company && ` · ${primaryCompany?.name ?? person.company} (${person.company})`}
          </p>
          {otherRoles.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Also files as {otherRoles.map(([ticker, title]) => `${title} at ${ticker}`).join(', ')}
            </p>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Portfolio value" value={fmtCurrency(summary.portfolioValue)} sublabel={`${holdings.length} holding${holdings.length === 1 ? '' : 's'}, reported`} />
        <StatTile
          label="Net activity"
          value={`${net >= 0 ? '+' : ''}${fmtCurrency(net)}`}
          tone={net >= 0 ? 'good' : 'critical'}
          sublabel="bought minus sold"
        />
        <StatTile label="Buys" value={summary.buyCount} tone="good" sublabel={fmtCurrency(summary.buyValue)} />
        <StatTile label="Sells" value={summary.sellCount} tone="critical" sublabel={fmtCurrency(summary.sellValue)} />
      </div>

      {person.executiveDisclosure && (
        <div className="mb-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Executive branch disclosure ({person.executiveDisclosure.formType})
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            A third disclosure system — distinct from SEC Form 4 and congressional STOCK Act reports. Officials in
            the executive branch (President, VP, senior appointees) file this with the U.S. Office of Government
            Ethics. Reports disclosed VALUE RANGES for the {person.executiveDisclosure.year} calendar year, filed{' '}
            {fmtDate(person.executiveDisclosure.filedDate)}, not exact figures.{' '}
            <a href={person.executiveDisclosure.filingUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              Real filing (PDF) ↗
            </a>
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--gridline)' }}
                >
                  <th className="px-4 py-2.5 font-medium">Holding</th>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reported value range</th>
                </tr>
              </thead>
              <tbody>
                {person.executiveDisclosure.holdings.map((h, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gridline)' }} className="last:border-b-0">
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {h.ticker ?? h.name}
                      {h.ticker && <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{h.name}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {h.account}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {fmtCurrency(h.valueLow)} – {fmtCurrency(h.valueHigh)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {person.executiveDisclosure.transactions?.length > 0 && (
            <div className="mt-3 space-y-1">
              {person.executiveDisclosure.transactions.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <StatusPill type={t.type} />
                  <span>{t.description}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {fmtDate(t.date)} · {fmtCurrency(t.amountLow)} – {fmtCurrency(t.amountHigh)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {person.beneficialOwnership?.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Beneficial ownership (Schedule 13D/13G)
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            A distinct SEC filing type from Form 4 and a 13F — filed by any person or entity that crosses 5%
            beneficial ownership of a public company's stock. Each row is a point-in-time snapshot as of its own
            filing date, not a continuously updated position like Form 4 holdings above.
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--gridline)' }}
                >
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 text-right font-medium">Shares</th>
                  <th className="px-4 py-2.5 text-right font-medium">% of class</th>
                  <th className="px-4 py-2.5 font-medium">As of</th>
                  <th className="px-4 py-2.5 text-right font-medium">Filing</th>
                </tr>
              </thead>
              <tbody>
                {person.beneficialOwnership.map((b, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gridline)' }} className="last:border-b-0">
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {b.ticker ?? b.companyName}
                      {b.ticker && (
                        <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                          {b.companyName}
                        </span>
                      )}
                      {b.note && (
                        <div className="mt-0.5 text-xs font-normal" style={{ color: 'var(--status-warning)' }}>
                          {b.note}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {fmtShares(b.shares)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {b.percentOfClass}%
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {fmtDate(b.asOfDate)} · {b.filingType}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={b.filingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        SEC ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {person.fund && person.fundHoldings && (
        <div className="mb-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            {person.fundHoldings.formType === 'NPORT-P' ? 'Fund portfolio (Form N-PORT)' : 'Fund portfolio (13F)'}
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            {person.fundHoldings.fundName && person.fundHoldings.fundName !== person.name && (
              <>Filed by {person.fundHoldings.fundName}, which {person.name} controls. </>
            )}
            {person.fundHoldings.formType === 'NPORT-P' ? (
              <>
                The fund's own real disclosed portfolio as of {fmtDate(person.fundHoldings.asOfDate)} — mostly private
                company stakes, not U.S.-listed equities, which is why they never show up in a 13F or Form 4.
              </>
            ) : (
              <>
                Full quarterly institutional holdings as of {fmtDate(person.fundHoldings.asOfDate)} — reported with up
                to a 45-day lag, U.S.-listed equity positions only.
              </>
            )}{' '}
            <a href={person.fundHoldings.filingUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              SEC filing ↗
            </a>
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--gridline)' }}
                >
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Position</th>
                  <th className="px-4 py-2.5 text-right font-medium">Shares</th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {person.fundHoldings.positions.map((pos, i) => (
                  <tr
                    key={`${pos.cusip}-${pos.positionType}-${i}`}
                    style={{ borderBottom: '1px solid var(--gridline)' }}
                    className="last:border-b-0 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {pos.issuer}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {pos.positionType}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {fmtShares(pos.shares)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmtCurrency(pos.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hide only when every Form4 holding is priceless (the true redundant
          case — a fund's own tiny Form4 stub position already shown, priced,
          in its 13F table above). A mixed case like Thiel, with a real priced
          personal position separate from his fund, should still show it. */}
      {holdings.length > 0 && !(person.fund && holdings.every((h) => h.value == null)) && (
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div
          className="rounded-lg border p-4 lg:col-span-3"
          style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Holdings by market value
          </h2>
          <HoldingsChart holdings={holdings} />
        </div>

        <div
          className="rounded-lg border p-4 lg:col-span-2"
          style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Position detail
          </h2>
          <div className="space-y-3">
            {holdings.map((h) => (
              <div key={h.ticker} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {h.ticker}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {fmtShares(h.shares)} sh · as of {fmtDate(h.asOfDate)}
                    {h.sourceEvent && ` · via ${h.sourceEvent}, not a market trade`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {fmtCurrency(h.value)}
                  </div>
                  <div className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {h.price ? `@ $${h.price.toFixed(2)}` : 'no market price on file'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
        Transaction history
      </h2>
      {history.length === 0 && (
        <div
          className="mb-6 rounded-lg border p-4 text-sm"
          style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          No real open-market purchase (P) or sale (S) transactions on file for {person.name}.
          {(person.otherEvents?.length > 0 || person.optionPositions?.length > 0) ? (
            <> Their real disclosed activity is option/warrant exercises and other non-market events — see below.</>
          ) : (
            <> No other real filing events on file either.</>
          )}
        </div>
      )}
      {history.length > 0 && (
      <>
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr
              className="text-left text-xs uppercase tracking-wide"
              style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--gridline)' }}
            >
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 text-right font-medium">Shares</th>
              <th className="px-4 py-2.5 text-right font-medium">Price</th>
              <th className="px-4 py-2.5 text-right font-medium">Shares owned after</th>
              <th className="px-4 py-2.5 text-right font-medium">Date</th>
              <th className="px-4 py-2.5 text-right font-medium">Filing</th>
            </tr>
          </thead>
          <tbody>
            {history.map((tx) => (
              <tr key={tx.id} style={{ borderBottom: '1px solid var(--gridline)' }} className="last:border-b-0 transition-colors hover:bg-[var(--surface-2)]">
                <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {tx.ticker}
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill type={tx.type} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {fmtShares(tx.shares)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  ${tx.price.toFixed(2)}
                  {tx.tranches > 1 && (
                    <span style={{ color: 'var(--text-muted)' }}> ({tx.tranches}x)</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {fmtShares(tx.sharesOwnedAfter)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {fmtDate(tx.date)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {tx.filingUrl && (
                    <a
                      href={tx.filingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      SEC ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}

      {person.optionPositions?.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Options &amp; derivative holdings
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Real stock options, RSUs, and warrants from Form 4's derivative table — never a market trade.
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--gridline)' }}
                >
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Security</th>
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 text-right font-medium">Underlying shares</th>
                  <th className="px-4 py-2.5 text-right font-medium">Exercise price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Expires</th>
                  <th className="px-4 py-2.5 text-right font-medium">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium">Filing</th>
                </tr>
              </thead>
              <tbody>
                {person.optionPositions.map((op, i) => (
                  <tr
                    key={`${op.accession}-${i}`}
                    style={{ borderBottom: '1px solid var(--gridline)' }}
                    className="last:border-b-0 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {op.ticker}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {op.securityTitle}
                    </td>
                    <td className="px-4 py-2.5 text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                      {op.eventType}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {op.underlyingShares != null ? fmtShares(op.underlyingShares) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {op.exercisePrice != null ? `$${op.exercisePrice.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {op.expirationDate ? fmtDate(op.expirationDate) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {fmtDate(op.date)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {op.filingUrl && (
                        <a
                          href={op.filingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          SEC ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {person.otherEvents?.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Other real filing events
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Real, sourced events that aren't open-market trades — stock awards, gifts, option exercises, tax
            withholding. Shown for transparency; excluded from the buy/sell feed and stats above.
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--gridline)' }}
                >
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 text-right font-medium">Shares</th>
                  <th className="px-4 py-2.5 text-right font-medium">Shares owned after</th>
                  <th className="px-4 py-2.5 text-right font-medium">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium">Filing</th>
                </tr>
              </thead>
              <tbody>
                {person.otherEvents.map((ev, i) => (
                  <tr
                    key={`${ev.accession}-${i}`}
                    style={{ borderBottom: '1px solid var(--gridline)' }}
                    className="last:border-b-0 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {ev.ticker}
                    </td>
                    <td className="px-4 py-2.5 text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                      {ev.eventType}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {fmtShares(ev.shares)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {ev.sharesOwnedAfter != null ? fmtShares(ev.sharesOwnedAfter) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {fmtDate(ev.date)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {ev.filingUrl && (
                        <a
                          href={ev.filingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          SEC ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
