// Targeted addition keyed by REPORTING OWNER (not issuer): fetches every
// real Form 4 this specific person has filed, across whatever companies
// they're an insider of. Open-market P/S transactions merge into the normal
// buy/sell feed. Everything else (awards, gifts, option exercises) is real
// too, but isn't a market trade — so it's kept out of the buy/sell feed and
// instead used only to derive a real, sourced "shares currently held"
// snapshot (person.staticHoldings), never presented as a buy or sell.
//
// Usage: node scripts/add-person.mjs "Display Name" OWNER_CIK
import { readFileSync, writeFileSync } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'

const USER_AGENT = 'InsiderDeskResearch/1.0 (contact: research@insiderdesk.app)'
const REQUEST_DELAY_MS = 180
const parser = new XMLParser({ ignoreAttributes: false })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const [, , displayName, ownerCik] = process.argv
if (!displayName || !ownerCik) {
  console.error('Usage: node scripts/add-person.mjs "Display Name" OWNER_CIK')
  process.exit(1)
}

async function fetchText(url, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      if (attempt === tries) {
        console.warn(`  ! giving up on ${url}: ${err.message}`)
        return null
      }
      await sleep(400 * attempt)
    }
  }
  return null
}

function asArray(x) {
  if (x === undefined || x === null) return []
  return Array.isArray(x) ? x : [x]
}

async function listFilings(cik) {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=100&output=atom`
  await sleep(REQUEST_DELAY_MS)
  const xml = await fetchText(url)
  if (!xml) return []
  const doc = parser.parse(xml)
  const entries = doc?.feed?.entry
  const list = entries ? (Array.isArray(entries) ? entries : [entries]) : []
  return list
    .map((e) => ({ accession: e.content?.['accession-number'], indexHref: e.content?.['filing-href'] }))
    .filter((e) => e.accession && e.indexHref)
}

async function fetchPrimaryDocXml(accessionUrl) {
  const base = accessionUrl.replace(/\/[^/]+-index\.htm$/, '')
  await sleep(REQUEST_DELAY_MS)
  const indexHtml = await fetchText(`${base}/`)
  if (!indexHtml) return null
  const hrefs = [...indexHtml.matchAll(/href="([^"]+\.xml)"/g)].map((m) => m[1]).filter((h) => !h.includes('/xsl'))
  if (hrefs.length === 0) return null
  const docUrl = hrefs[0].startsWith('http') ? hrefs[0] : `https://www.sec.gov${hrefs[0]}`
  await sleep(REQUEST_DELAY_MS)
  return fetchText(docUrl)
}

const CODE_LABEL = {
  A: 'award',
  G: 'gift',
  M: 'option exercise',
  F: 'tax withholding',
  C: 'conversion',
  X: 'option exercise',
  D: 'disposition to issuer',
  J: 'other',
}

// Tracks the most-recent-dated holding per ticker. A single filing can
// report BOTH a direct position (a transaction block) and an indirect one
// (a holding block, e.g. shares now held via a trust) on the same date —
// those are the same beneficial owner's total position, so same-date
// entries are summed rather than one silently overwriting the other.
function recordHolding(holdingsByTicker, ticker, entry) {
  const existing = holdingsByTicker[ticker]
  if (!existing || new Date(entry.date) > new Date(existing.date)) {
    holdingsByTicker[ticker] = { ...entry }
    return
  }
  if (new Date(entry.date).getTime() === new Date(existing.date).getTime()) {
    existing.shares += entry.shares
    if (entry.eventType && !existing.eventType.includes(entry.eventType)) {
      existing.eventType = `${existing.eventType}; ${entry.eventType}`
    }
  }
}

async function main() {
  const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
  const transactions = JSON.parse(readFileSync('src/data/generated/transactions.json', 'utf8'))
  const companies = JSON.parse(readFileSync('src/data/generated/companies.json', 'utf8'))

  const filings = await listFilings(ownerCik)
  console.log(`Found ${filings.length} filings for ${displayName} (CIK ${ownerCik})`)

  const roles = {}
  const holdingsByTicker = {} // ticker -> { shares, date, source: {code, accession} }
  const newBuySell = []
  const otherEvents = [] // every non-P/S nonDerivative event, for real transaction history (not the buy/sell feed)
  const optionEvents = [] // every derivative-table event (options, RSUs, warrants)
  let personId = null

  for (const filing of filings) {
    const xml = await fetchPrimaryDocXml(filing.indexHref)
    if (!xml) continue
    let doc
    try {
      doc = parser.parse(xml)
    } catch {
      continue
    }
    const root = doc?.ownershipDocument
    if (!root) continue
    const issuer = root.issuer ?? {}
    // Older filings sometimes bake the exchange into this field, e.g. "AMEX: RIV".
    // Filers without a real ticker (fund-interest units) often put the
    // literal text "NONE" here instead of leaving it empty.
    const ticker = issuer.issuerTradingSymbol?.replace(/^[A-Z]+:\s*/, '').trim()
    if (!ticker || ticker.toUpperCase() === 'NONE') continue

    const owner = root.reportingOwner
    const ownerObj = Array.isArray(owner) ? owner[0] : owner
    const rel = ownerObj?.reportingOwnerRelationship ?? {}
    const toBool = (v) => v === true || v === 1 || ['true', '1'].includes(String(v).trim().toLowerCase())
    let title = 'Reporting Person'
    if (toBool(rel.isOfficer) && rel.officerTitle) title = rel.officerTitle
    else if (toBool(rel.isDirector)) title = 'Director'
    else if (toBool(rel.isTenPercentOwner)) title = '10% Owner'
    roles[ticker] = title

    if (!personId) {
      personId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + String(ownerCik).slice(-4)
    }

    const nonDeriv = asArray(root.nonDerivativeTable?.nonDerivativeTransaction)
    for (const t of nonDeriv) {
      const code = t.transactionCoding?.transactionCode
      const shares = Number(t.transactionAmounts?.transactionShares?.value)
      const price = Number(t.transactionAmounts?.transactionPricePerShare?.value)
      const date = t.transactionDate?.value
      const sharesOwnedAfter = Number(t.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value)
      if (!date) continue

      if (code === 'P' || code === 'S') {
        if (!shares || !price) continue
        newBuySell.push({
          personId,
          ticker,
          type: code === 'P' ? 'buy' : 'sell',
          shares,
          price,
          date,
          sharesOwnedAfter: Number.isFinite(sharesOwnedAfter) ? sharesOwnedAfter : null,
          accession: filing.accession,
          filingUrl: filing.indexHref,
        })
        console.log(`  + ${code === 'P' ? 'BUY' : 'SELL'} ${ticker} ${shares} sh @ $${price} on ${date} (${filing.accession})`)
      } else {
        if (Number.isFinite(sharesOwnedAfter)) {
          recordHolding(holdingsByTicker, ticker, {
            shares: sharesOwnedAfter,
            date,
            eventType: CODE_LABEL[code] ?? 'other',
            accession: filing.accession,
            filingUrl: filing.indexHref,
          })
        }
        if (shares) {
          otherEvents.push({
            ticker,
            code,
            eventType: CODE_LABEL[code] ?? code ?? 'other',
            shares,
            price: price || null,
            date,
            sharesOwnedAfter: Number.isFinite(sharesOwnedAfter) ? sharesOwnedAfter : null,
            accession: filing.accession,
            filingUrl: filing.indexHref,
          })
        }
      }
    }

    // A holding block (as opposed to a transaction block) reports a position
    // with no trade this period — most commonly shares held INDIRECTLY (via
    // a trust, LLC, etc.) alongside a same-filing direct-ownership
    // transaction. Real example: Trump's Dec 2024 Form 4 reports 0 shares
    // owned DIRECTLY (he gifted them away) but this block on the same filing
    // reports 114,750,000 shares held INDIRECTLY by his revocable trust — the
    // true beneficial position, silently dropped if this block is ignored.
    const holdingBlocks = asArray(root.nonDerivativeTable?.nonDerivativeHolding)
    for (const h of holdingBlocks) {
      const sharesOwnedAfter = Number(h.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value)
      if (!Number.isFinite(sharesOwnedAfter)) continue
      const ownership = h.ownershipNature?.directOrIndirectOwnership?.value
      const nature = h.ownershipNature?.natureOfOwnership?.value
      recordHolding(holdingsByTicker, ticker, {
        shares: sharesOwnedAfter,
        date: root.periodOfReport,
        eventType: ownership === 'I' ? `held indirectly${nature ? ` (${nature})` : ''}` : 'holding',
        accession: filing.accession,
        filingUrl: filing.indexHref,
      })
    }

    // Derivative table: stock options, RSUs, warrants — real disclosed positions,
    // never a market buy/sell, kept fully separate from the transaction feed.
    const deriv = asArray(root.derivativeTable?.derivativeTransaction)
    for (const t of deriv) {
      const code = t.transactionCoding?.transactionCode
      const date = t.transactionDate?.value
      const underlyingShares = Number(t.underlyingSecurity?.underlyingSecurityShares?.value)
      const exercisePrice = Number(t.conversionOrExercisePrice?.value)
      const sharesOwnedAfter = Number(t.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value)
      if (!date) continue
      optionEvents.push({
        ticker,
        securityTitle: t.securityTitle?.value ?? 'Derivative security',
        code,
        eventType: CODE_LABEL[code] ?? code ?? 'other',
        underlyingShares: Number.isFinite(underlyingShares) ? underlyingShares : null,
        exercisePrice: Number.isFinite(exercisePrice) ? exercisePrice : null,
        expirationDate: t.expirationDate?.value ?? null,
        sharesOwnedAfter: Number.isFinite(sharesOwnedAfter) ? sharesOwnedAfter : null,
        date,
        accession: filing.accession,
        filingUrl: filing.indexHref,
      })
    }
  }

  if (!personId) {
    console.log('No filings with a resolvable issuer found. Nothing added.')
    return
  }

  let p = people.find((x) => x.id === personId)
  const primaryTicker = Object.keys(roles)[0]
  if (!p) {
    p = {
      id: personId,
      cik: String(ownerCik),
      name: displayName,
      title: roles[primaryTicker] ?? 'Reporting Person',
      company: primaryTicker,
      roles,
      initials: displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''),
    }
    people.push(p)
  } else {
    p.roles = { ...p.roles, ...roles }
  }

  // Real holdings, sourced from real filings — never presented as a buy/sell.
  p.staticHoldings = Object.entries(holdingsByTicker).map(([ticker, h]) => ({
    ticker,
    shares: h.shares,
    asOfDate: h.date,
    sourceEvent: h.eventType,
    filingUrl: h.filingUrl,
  }))

  // Every real filing event that isn't a market buy/sell (awards, gifts,
  // exercises, tax withholding) — shown as real history, never as a trade.
  p.otherEvents = otherEvents.sort((a, b) => new Date(b.date) - new Date(a.date))

  // Real derivative/option positions (stock options, RSUs, warrants).
  p.optionPositions = optionEvents.sort((a, b) => new Date(b.date) - new Date(a.date))

  // Safe to re-run (e.g. from a daily cron): skip transactions already recorded.
  const existingKeys = new Set(transactions.map((t) => `${t.personId}|${t.ticker}|${t.type}|${t.date}|${t.accession}`))
  const freshBuySell = newBuySell.filter((t) => !existingKeys.has(`${t.personId}|${t.ticker}|${t.type}|${t.date}|${t.accession}`))
  transactions.push(...freshBuySell.map((t, i) => ({ id: `${t.accession}-owner-${i}`, ...t })))

  for (const ticker of Object.keys(roles)) {
    if (!companies[ticker]) {
      companies[ticker] = { name: ticker, sector: null, price: null, priceAsOf: null }
      console.log(`  (added placeholder company entry for new ticker ${ticker} — no P/S price available to reference)`)
    }
  }

  writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
  writeFileSync('src/data/generated/transactions.json', JSON.stringify(transactions, null, 2) + '\n')
  writeFileSync('src/data/generated/companies.json', JSON.stringify(companies, null, 2) + '\n')

  console.log(
    `\nDone. ${freshBuySell.length} new buy/sell (${newBuySell.length} total), ` +
      `${p.otherEvents.length} other filing event(s), ${p.optionPositions.length} derivative/option event(s), ` +
      `${p.staticHoldings.length} holdings snapshot(s) for ${displayName}.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
