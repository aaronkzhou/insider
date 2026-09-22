import { useMemo, useState } from 'react'
import StatTile from '../components/StatTile'
import TransactionTable from '../components/TransactionTable'
import ActivityChart from '../components/ActivityChart'
import ClusterActivity from '../components/ClusterActivity'
import MarketAlerts from '../components/MarketAlerts'
import CalendarHeatmap from '../components/CalendarHeatmap'
import { fmtCurrency, fmtDate, marketSummary, recentTransactions } from '../lib/portfolio'
import meta from '../data/generated/meta.json'

const WINDOW_DAYS = 180

export default function Dashboard() {
  const [selectedDay, setSelectedDay] = useState(null)

  const all = useMemo(
    () => recentTransactions(WINDOW_DAYS).slice().sort((a, b) => new Date(b.date) - new Date(a.date)),
    [],
  )
  const summary = useMemo(() => marketSummary(all), [all])
  const buys = useMemo(() => all.filter((tx) => tx.type === 'buy'), [all])
  const sells = useMemo(() => all.filter((tx) => tx.type === 'sell'), [all])

  const dayTxs = useMemo(
    () => (selectedDay ? all.filter((tx) => tx.date === selectedDay) : []),
    [all, selectedDay],
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Insider Activity Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Who's buying, who's selling — real SEC Form 4 open-market transactions, last 6 months.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total Bought" value={fmtCurrency(summary.buyValue)} tone="good" sublabel="last 6 months" />
        <StatTile label="Total Sold" value={fmtCurrency(summary.sellValue)} tone="critical" sublabel="last 6 months" />
        <StatTile
          label="Net Flow"
          value={fmtCurrency(summary.netValue)}
          tone={summary.netValue >= 0 ? 'good' : 'critical'}
          sublabel={summary.netValue >= 0 ? 'net buying' : 'net selling'}
        />
        <StatTile
          label="Transactions"
          value={summary.tradeCount}
          sublabel={summary.tradeCount ? `P/S codes, ${fmtDate(summary.earliestDate)} – ${fmtDate(summary.latestDate)}` : 'no P/S trades in window'}
        />
      </div>

      <div
        className="mb-6 rounded-lg border p-4"
        style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
      >
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Monthly buy vs. sell value
        </h2>
        <ActivityChart transactions={all} />
      </div>

      <div className="mb-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Cluster activity
        </h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Two or more insiders at the same company trading the same direction within a few days of each other.
        </p>
        <ClusterActivity transactions={all} windowDays={5} />
      </div>

      <div className="mb-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--status-warning)' }}>
          Market-wide radar
        </h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Stocks NOT in our tracked list where several insiders just filed together — found by scanning SEC's
          real-time market-wide Form 4 feed, not scoped to any company on this site.
        </p>
        <MarketAlerts />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4">
        <div
          className="rounded-lg border p-4"
          style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--status-good)' }}>
            Buy activity
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Each cell is one day — darker means more insiders bought. Hover for names, click for detail.
          </p>
          <CalendarHeatmap
            transactions={buys}
            colorVar="var(--status-good)"
            onSelectDay={setSelectedDay}
            selectedDay={selectedDay}
          />
        </div>

        <div
          className="rounded-lg border p-4"
          style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--status-critical)' }}>
            Sell activity
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Each cell is one day — darker means more insiders sold. Hover for names, click for detail.
          </p>
          <CalendarHeatmap
            transactions={sells}
            colorVar="var(--status-critical)"
            onSelectDay={setSelectedDay}
            selectedDay={selectedDay}
          />
        </div>
      </div>

      {selectedDay && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
              {fmtDate(selectedDay)} — {dayTxs.length} transaction{dayTxs.length === 1 ? '' : 's'}
            </h2>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Clear ✕
            </button>
          </div>
          <TransactionTable transactions={dayTxs} />
        </div>
      )}

      <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        Source: {meta.source}. Fetched {fmtDate(meta.fetchedAt)}. Open-market purchase (code P) and sale (code S)
        transactions only — routine option exercises, RSU vesting, and tax-withholding dispositions are excluded.
        Reference prices are each ticker's most recently reported insider transaction price, not a live market quote.
      </p>
    </div>
  )
}
