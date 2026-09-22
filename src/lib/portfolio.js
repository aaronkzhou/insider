import { companies } from '../data/companies'
import { getPerson } from '../data/people'
import { transactions } from '../data/transactions'

export function txValue(tx) {
  return tx.shares * tx.price
}

export function personTransactions(personId) {
  return transactions
    .filter((tx) => tx.personId === personId)
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

/** Each transaction already carries its own reported shares-owned-after (SEC filings report this directly). */
export function personTransactionsWithRunningTotal(personId) {
  return personTransactions(personId)
}

/**
 * Current holdings by ticker for a person: shares + market value, using the
 * shares-owned-after figure from their most recent filing on that ticker
 * (the authoritative number SEC filers themselves report). No cost basis /
 * gain% is shown — full purchase history isn't available, so we don't invent one.
 */
export function personHoldings(personId) {
  const byTicker = {}
  for (const tx of transactions) {
    if (tx.personId !== personId) continue
    if (tx.sharesOwnedAfter == null) continue
    const existing = byTicker[tx.ticker]
    if (!existing || new Date(tx.date) > new Date(existing.date)) {
      byTicker[tx.ticker] = { date: tx.date, shares: tx.sharesOwnedAfter, sourceEvent: null }
    }
  }

  // Some people have real filings with no open-market trade (a stock award
  // or gift, say) — still a real, sourced position, just not from buying or
  // selling. Only fills in tickers with no P/S-derived holding above.
  for (const h of getPerson(personId)?.staticHoldings ?? []) {
    const existing = byTicker[h.ticker]
    if (!existing || new Date(h.asOfDate) > new Date(existing.date)) {
      byTicker[h.ticker] = { date: h.asOfDate, shares: h.shares, sourceEvent: h.sourceEvent, filingUrl: h.filingUrl }
    }
  }

  return Object.entries(byTicker)
    .filter(([, h]) => h.shares > 0)
    .map(([ticker, h]) => {
      const company = companies[ticker]
      return {
        ticker,
        name: company?.name ?? ticker,
        sector: company?.sector,
        shares: h.shares,
        price: company?.price ?? null,
        priceAsOf: company?.priceAsOf ?? null,
        value: company?.price ? h.shares * company.price : null,
        asOfDate: h.date,
        sourceEvent: h.sourceEvent,
      }
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
}

export function personPortfolioValue(personId) {
  // Someone can hold real Form 4-disclosed shares personally AND separately
  // control a fund with its own 13F — sum both rather than letting one
  // silently hide the other (a pure-fund person's Form4 value is ~0 anyway).
  const formHoldingsValue = personHoldings(personId).reduce((sum, h) => sum + (h.value ?? 0), 0)
  const fund = getPerson(personId)?.fundHoldings
  return formHoldingsValue + (fund?.totalValue ?? 0)
}

export function personSummary(personId) {
  const txs = transactions.filter((tx) => tx.personId === personId)
  const buys = txs.filter((tx) => tx.type === 'buy')
  const sells = txs.filter((tx) => tx.type === 'sell')
  const last = txs.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0]
  return {
    tradeCount: txs.length,
    buyCount: buys.length,
    sellCount: sells.length,
    buyValue: buys.reduce((s, tx) => s + txValue(tx), 0),
    sellValue: sells.reduce((s, tx) => s + txValue(tx), 0),
    lastTradeDate: last?.date,
    lastTradeType: last?.type,
    portfolioValue: personPortfolioValue(personId),
    tickers: [...new Set(txs.map((tx) => tx.ticker))],
  }
}

/**
 * Congressional STOCK Act disclosures (person.congressionalTrades) report
 * dollar RANGES, not exact figures, and never a resulting position size — so
 * there's no portfolio value to compute, only trade counts and range totals.
 */
export function personCongressionalSummary(personId) {
  const trades = getPerson(personId)?.congressionalTrades ?? []
  const buys = trades.filter((t) => t.type === 'buy')
  const sells = trades.filter((t) => t.type === 'sell')
  const last = trades[0] // already sorted newest-first by the fetch script
  return {
    tradeCount: trades.length,
    buyCount: buys.length,
    sellCount: sells.length,
    lowTotal: trades.reduce((s, t) => s + t.amountLow, 0),
    highTotal: trades.reduce((s, t) => s + t.amountHigh, 0),
    lastTradeDate: last?.date,
    tickers: [...new Set(trades.map((t) => t.ticker).filter(Boolean))],
  }
}

export function allTransactionsSorted() {
  return transactions.slice().sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function marketSummary() {
  const buyValue = transactions
    .filter((tx) => tx.type === 'buy')
    .reduce((s, tx) => s + txValue(tx), 0)
  const sellValue = transactions
    .filter((tx) => tx.type === 'sell')
    .reduce((s, tx) => s + txValue(tx), 0)
  return {
    buyValue,
    sellValue,
    netValue: buyValue - sellValue,
    tradeCount: transactions.length,
  }
}

/**
 * Cluster detection: 2+ distinct insiders trading the same ticker, same
 * direction (buy or sell), within `windowDays` of each other — the classic
 * "insiders moving together" signal insider-trading trackers surface.
 */
export function detectClusters(windowDays = 5) {
  const groups = {}
  for (const tx of transactions) {
    const key = `${tx.ticker}|${tx.type}`
    ;(groups[key] ??= []).push(tx)
  }

  const clusters = []
  for (const txs of Object.values(groups)) {
    const sorted = txs.slice().sort((a, b) => new Date(a.date) - new Date(b.date))
    let current = []
    for (const tx of sorted) {
      if (current.length === 0) {
        current = [tx]
        continue
      }
      const clusterStart = new Date(current[0].date)
      const diffDays = (new Date(tx.date) - clusterStart) / 86_400_000
      if (diffDays <= windowDays) {
        current.push(tx)
      } else {
        pushCluster(current, clusters)
        current = [tx]
      }
    }
    pushCluster(current, clusters)
  }

  // Biggest clusters (most insiders moving together) first — that's the
  // strongest signal — recency as the tiebreaker.
  return clusters.sort(
    (a, b) => b.personIds.length - a.personIds.length || new Date(b.endDate) - new Date(a.endDate),
  )
}

function pushCluster(txs, clusters) {
  const personIds = [...new Set(txs.map((t) => t.personId))]
  if (personIds.length < 2) return
  const dates = txs.map((t) => t.date).sort()
  clusters.push({
    ticker: txs[0].ticker,
    type: txs[0].type,
    txs: txs.slice().sort((a, b) => new Date(a.date) - new Date(b.date)),
    personIds,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    totalValue: txs.reduce((s, t) => s + txValue(t), 0),
    totalShares: txs.reduce((s, t) => s + t.shares, 0),
  })
}

export function fmtCurrency(value, opts = {}) {
  if (value == null) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) {
    return `${value < 0 ? '-' : ''}$${(abs / 1_000_000_000).toFixed(2)}B`
  }
  if (abs >= 1_000_000) {
    return `${value < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`
  }
  if (abs >= 1_000) {
    return `${value < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}K`
  }
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', ...opts })
}

export function fmtShares(value) {
  if (value == null) return '—'
  return value.toLocaleString('en-US')
}

/**
 * `new Date("2026-09-17")` parses as UTC midnight, which renders as the
 * previous day in any timezone behind UTC. Parse date-only strings as local
 * calendar components instead so a filing date never silently shifts by a day.
 */
export function parseDateOnly(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isoDay(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? parseDateOnly(iso) : new Date(iso)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
