import { Link } from 'react-router-dom'
import StatusPill from './StatusPill'
import { getPerson } from '../data/people'
import { companies } from '../data/companies'
import { fmtCurrency, fmtDate, fmtShares, txValue } from '../lib/portfolio'

export default function TransactionTable({ transactions, showPerson = true }) {
  if (transactions.length === 0) {
    return (
      <div
        className="rounded-lg border p-8 text-center text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        No transactions match these filters.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr
            className="text-left text-xs uppercase tracking-wide"
            style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--gridline)' }}
          >
            {showPerson && <th className="px-4 py-2.5 font-medium">Insider</th>}
            <th className="px-4 py-2.5 font-medium">Company</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 text-right font-medium">Shares</th>
            <th className="px-4 py-2.5 text-right font-medium">Price</th>
            <th className="px-4 py-2.5 text-right font-medium">Value</th>
            <th className="px-4 py-2.5 text-right font-medium">Date</th>
            <th className="px-4 py-2.5 text-right font-medium">Filing</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const person = getPerson(tx.personId)
            const company = companies[tx.ticker]
            return (
              <tr
                key={tx.id}
                style={{ borderBottom: '1px solid var(--gridline)' }}
                className="last:border-b-0 transition-colors hover:bg-[var(--surface-2)]"
              >
                {showPerson && (
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/people/${tx.personId}`}
                      className="font-medium hover:underline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {person?.name ?? tx.personId}
                    </Link>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {person?.title}
                    </div>
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {tx.ticker}
                  </span>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {company?.name}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill type={tx.type} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {fmtShares(tx.shares)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  ${tx.price.toFixed(2)}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {fmtCurrency(txValue(tx))}
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
