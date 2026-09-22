import marketAlerts from '../data/generated/market-alerts.json'
import { fmtDate } from '../lib/portfolio'
import StatusPill from './StatusPill'

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
            <div className="flex items-center justify-between gap-2">
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
              <div className="flex shrink-0 items-center gap-1.5">
                {(a.direction === 'buy' || a.direction === 'sell') && <StatusPill type={a.direction} />}
                {a.direction === 'mixed' && (
                  <span
                    className="rounded-full px-2 py-1 text-xs font-semibold"
                    style={{ color: 'var(--text-secondary)', background: 'var(--surface-2)' }}
                  >
                    Mixed
                  </span>
                )}
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: 'var(--status-warning)', color: '#080404' }}
                >
                  {a.insiderCount}
                </span>
              </div>
            </div>

            {(a.buys > 0 || a.sells > 0 || a.other > 0) && (
              <div className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                {a.buys > 0 && <span style={{ color: 'var(--status-good)' }}>{a.buys} buy</span>}
                {a.buys > 0 && (a.sells > 0 || a.other > 0) && ' · '}
                {a.sells > 0 && <span style={{ color: 'var(--status-critical)' }}>{a.sells} sell</span>}
                {a.sells > 0 && a.other > 0 && ' · '}
                {a.other > 0 && <span>{a.other} other (award, exercise, etc.)</span>}
              </div>
            )}

            <div className="mt-3 space-y-1">
              {a.insiders.slice(0, 5).map((ins) => (
                <a
                  key={ins.name}
                  href={ins.filingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 truncate text-sm hover:underline"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span className="truncate">{ins.name}</span>
                  {ins.type === 'buy' && (
                    <span className="shrink-0 text-xs" style={{ color: 'var(--status-good)' }}>
                      buy
                    </span>
                  )}
                  {ins.type === 'sell' && (
                    <span className="shrink-0 text-xs" style={{ color: 'var(--status-critical)' }}>
                      sell
                    </span>
                  )}
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
