import marketAlerts from '../data/generated/market-alerts.json'
import { fmtDate } from '../lib/portfolio'

/** Stocks with a real insider-filing cluster that AREN'T in our tracked
 * company list — found by scanning SEC's market-wide Form 4 firehose
 * (scripts/scan-market-clusters.mjs), not scoped to any company we asked for. */
export default function MarketAlerts() {
  const alerts = marketAlerts?.alerts ?? []

  if (alerts.length === 0) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No untracked companies with a notable insider cluster right now.
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {alerts.slice(0, 9).map((a) => (
          <div
            key={a.cik}
            className="rounded-lg border p-4"
            style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {a.ticker ?? a.companyName}
                </span>
                {a.ticker && (
                  <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                    {a.companyName}
                  </div>
                )}
              </div>
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: 'var(--status-warning)', color: '#080404' }}
              >
                {a.insiderCount} insiders
              </span>
            </div>

            <div className="mt-3 space-y-1">
              {a.insiders.slice(0, 5).map((ins) => (
                <a
                  key={ins.name}
                  href={ins.filingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm hover:underline"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {ins.name}
                </a>
              ))}
              {a.insiders.length > 5 && (
                <div style={{ color: 'var(--text-muted)' }}>+{a.insiders.length - 5} more</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {marketAlerts?.scannedAt && (
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Scanned {fmtDate(marketAlerts.scannedAt)} · {marketAlerts.filingsScanned} recent Form 4 filings market-wide,
          not just our tracked companies.
        </p>
      )}
    </div>
  )
}
