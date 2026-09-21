import { useMemo, useState } from 'react'
import StatTile from '../components/StatTile'
import FilterBar from '../components/FilterBar'
import TransactionTable from '../components/TransactionTable'
import ActivityChart from '../components/ActivityChart'
import ClusterActivity from '../components/ClusterActivity'
import { allTransactionsSorted, fmtCurrency, fmtDate, marketSummary } from '../lib/portfolio'
import { getPerson } from '../data/people'
import { companies } from '../data/companies'
import meta from '../data/generated/meta.json'

export default function Dashboard() {
  const [type, setType] = useState('all')
  const [search, setSearch] = useState('')

  const summary = useMemo(() => marketSummary(), [])
  const all = useMemo(() => allTransactionsSorted(), [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((tx) => {
      if (type !== 'all' && tx.type !== type) return false
      if (!q) return true
      const person = getPerson(tx.personId)
      const company = companies[tx.ticker]
      return (
        person?.name.toLowerCase().includes(q) ||
        tx.ticker.toLowerCase().includes(q) ||
        company?.name.toLowerCase().includes(q)
      )
    })
  }, [all, type, search])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Insider Activity Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Who's buying, who's selling — real SEC Form 4 open-market transactions.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total Bought" value={fmtCurrency(summary.buyValue)} tone="good" sublabel="in tracked filings" />
        <StatTile label="Total Sold" value={fmtCurrency(summary.sellValue)} tone="critical" sublabel="in tracked filings" />
        <StatTile
          label="Net Flow"
          value={fmtCurrency(summary.netValue)}
          tone={summary.netValue >= 0 ? 'good' : 'critical'}
          sublabel={summary.netValue >= 0 ? 'net buying' : 'net selling'}
        />
        <StatTile label="Transactions" value={summary.tradeCount} sublabel="P/S codes only" />
      </div>

      <div
        className="mb-6 rounded-lg border p-4"
        style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
      >
        <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Monthly buy vs. sell value
        </h2>
        <ActivityChart />
      </div>

      <div className="mb-6">
        <h2 className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Cluster activity
        </h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Two or more insiders at the same company trading the same direction within a few days of each other.
        </p>
        <ClusterActivity windowDays={5} />
      </div>

      <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        Recent transactions
      </h2>
      <FilterBar type={type} onTypeChange={setType} search={search} onSearchChange={setSearch} />
      <TransactionTable transactions={filtered} />

      <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        Source: {meta.source}. Fetched {fmtDate(meta.fetchedAt)}. Open-market purchase (code P) and sale (code S)
        transactions only — routine option exercises, RSU vesting, and tax-withholding dispositions are excluded.
        Reference prices are each ticker's most recently reported insider transaction price, not a live market quote.
      </p>
    </div>
  )
}
