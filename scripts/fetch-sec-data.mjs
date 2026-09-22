// Fetches REAL Form 4 insider-transaction filings from SEC EDGAR (public,
// no API key) and writes static JSON the app reads at build time. Nothing
// here is invented — every transaction traces back to a real accession
// number / filing URL, which we keep on the record for attribution.
//
// Usage: node scripts/fetch-sec-data.mjs
//
// SEC fair-access policy: https://www.sec.gov/os/webmaster-faq#developers
// requires a descriptive User-Agent and asks for a modest request rate.
import { writeFileSync, mkdirSync } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'

const USER_AGENT = 'InsiderDeskResearch/1.0 (contact: research@insiderdesk.app)'
const FILINGS_PER_COMPANY = 50
const REQUEST_DELAY_MS = 180

// Real, verified CIKs (resolved from SEC's own company_tickers.json).
const COMPANIES = [
  { ticker: 'AAPL', cik: '0000320193', name: 'Apple Inc.', sector: 'Technology' },
  { ticker: 'MSFT', cik: '0000789019', name: 'Microsoft Corp.', sector: 'Technology' },
  { ticker: 'NVDA', cik: '0001045810', name: 'NVIDIA Corp.', sector: 'Semiconductors' },
  { ticker: 'TSLA', cik: '0001318605', name: 'Tesla, Inc.', sector: 'Automotive' },
  { ticker: 'AMZN', cik: '0001018724', name: 'Amazon.com Inc.', sector: 'E-Commerce' },
  { ticker: 'GOOGL', cik: '0001652044', name: 'Alphabet Inc.', sector: 'Technology' },
  { ticker: 'META', cik: '0001326801', name: 'Meta Platforms, Inc.', sector: 'Technology' },
  { ticker: 'NFLX', cik: '0001065280', name: 'Netflix Inc.', sector: 'Media' },
  { ticker: 'JPM', cik: '0000019617', name: 'JPMorgan Chase & Co.', sector: 'Financials' },
  { ticker: 'COST', cik: '0000909832', name: 'Costco Wholesale Corp.', sector: 'Retail' },
  { ticker: 'UBER', cik: '0001543151', name: 'Uber Technologies, Inc.', sector: 'Transportation' },
  { ticker: 'DIS', cik: '0001744489', name: 'Walt Disney Co.', sector: 'Media' },
  { ticker: 'DJT', cik: '0001849635', name: 'Trump Media & Technology Group Corp.', sector: 'Media' },
  { ticker: 'PSQH', cik: '0001847064', name: 'PSQ Holdings, Inc.', sector: 'E-Commerce' },
  { ticker: 'PEW', cik: '0002051380', name: 'GrabAGun Digital Holdings Inc.', sector: 'Retail' },
  { ticker: 'APPH', cik: '0001807707', name: 'AppHarvest, Inc.', sector: 'Agriculture' },
  { ticker: 'PLTR', cik: '0001321655', name: 'Palantir Technologies Inc.', sector: 'Technology' },
  { ticker: 'AMD', cik: '0000002488', name: 'Advanced Micro Devices Inc.', sector: 'Semiconductors' },
  { ticker: 'AVGO', cik: '0001730168', name: 'Broadcom Inc.', sector: 'Semiconductors' },
  { ticker: 'INTC', cik: '0000050863', name: 'Intel Corp.', sector: 'Semiconductors' },
  { ticker: 'MU', cik: '0000723125', name: 'Micron Technology Inc.', sector: 'Semiconductors' },
  { ticker: 'DXYZ', cik: '0001843974', name: 'Destiny Tech100 Inc.', sector: 'Closed-End Fund' },
  { ticker: 'VCX', cik: '0001867090', name: 'Fundrise Innovation Fund, LLC', sector: 'Closed-End Fund' },
  { ticker: 'SNDK', cik: '0002023554', name: 'Sandisk Corp.', sector: 'Semiconductors' },
  { ticker: 'BABA', cik: '0001577552', name: 'Alibaba Group Holding Ltd', sector: 'Technology' },
]

const parser = new XMLParser({ ignoreAttributes: false })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

async function listRecentForm4Filings(cik) {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=${FILINGS_PER_COMPANY}&output=atom`
  await sleep(REQUEST_DELAY_MS)
  const xml = await fetchText(url)
  if (!xml) return []
  const doc = parser.parse(xml)
  const entries = doc?.feed?.entry
  const list = entries ? (Array.isArray(entries) ? entries : [entries]) : []
  return list
    .map((e) => ({
      accession: e.content?.['accession-number'],
      filingDate: e.content?.['filing-date'],
      indexHref: e.content?.['filing-href'],
    }))
    .filter((e) => e.accession && e.indexHref)
}

function asArray(x) {
  if (x === undefined || x === null) return []
  return Array.isArray(x) ? x : [x]
}

async function fetchPrimaryDocXml(cik, accession) {
  const dashless = accession.replaceAll('-', '')
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${dashless}`

  // Optimistic guess (true for most filing agents) — saves a request.
  await sleep(REQUEST_DELAY_MS)
  const guess = await fetchText(`${base}/form4.xml`)
  if (guess) return guess

  // Fallback: read the filing index and find the primary XML doc.
  await sleep(REQUEST_DELAY_MS)
  const indexHtml = await fetchText(`${base}/`)
  if (!indexHtml) return null
  const hrefs = [...indexHtml.matchAll(/href="([^"]+\.xml)"/g)]
    .map((m) => m[1])
    .filter((h) => !h.includes('/xsl'))
  if (hrefs.length === 0) return null
  const docUrl = hrefs[0].startsWith('http') ? hrefs[0] : `https://www.sec.gov${hrefs[0]}`
  await sleep(REQUEST_DELAY_MS)
  return fetchText(docUrl)
}

function slugify(name, cik) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base}-${String(cik).slice(-4)}`
}

function extractTransactions(xmlText, fallbackTicker, accession, indexHref) {
  let doc
  try {
    doc = parser.parse(xmlText)
  } catch {
    return { person: null, txs: [] }
  }
  const root = doc?.ownershipDocument
  if (!root) return { person: null, txs: [] }

  const issuer = root.issuer ?? {}
  // Filers without a real exchange ticker (e.g. fund-interest units) often
  // put the literal text "NONE" here — treat that the same as empty.
  const rawSymbol = issuer.issuerTradingSymbol
  const ticker = rawSymbol && rawSymbol.toUpperCase() !== 'NONE' ? rawSymbol : fallbackTicker

  const owner = root.reportingOwner
  const ownerObj = Array.isArray(owner) ? owner[0] : owner
  if (!ownerObj) return { person: null, txs: [] }

  const cik = ownerObj.reportingOwnerId?.rptOwnerCik
  const name = ownerObj.reportingOwnerId?.rptOwnerName
  if (!cik || !name) return { person: null, txs: [] }

  // Some filing agents encode these as "true"/"false", others as 1/0 — accept both.
  const toBool = (v) => v === true || v === 1 || ['true', '1'].includes(String(v).trim().toLowerCase())
  const rel = ownerObj.reportingOwnerRelationship ?? {}
  const isOfficer = toBool(rel.isOfficer)
  const isDirector = toBool(rel.isDirector)
  const isTenPercent = toBool(rel.isTenPercentOwner)
  let title = 'Reporting Person'
  if (isOfficer && rel.officerTitle) title = rel.officerTitle
  else if (isDirector) title = 'Director'
  else if (isTenPercent) title = '10% Owner'

  const nonDeriv = asArray(root.nonDerivativeTable?.nonDerivativeTransaction)
  const txs = []
  for (const t of nonDeriv) {
    const code = t.transactionCoding?.transactionCode
    if (code !== 'P' && code !== 'S') continue
    const shares = Number(t.transactionAmounts?.transactionShares?.value)
    const price = Number(t.transactionAmounts?.transactionPricePerShare?.value)
    const date = t.transactionDate?.value
    const sharesOwnedAfter = Number(t.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value)
    if (!shares || !price || !date) continue
    txs.push({
      personCik: String(cik),
      ticker,
      type: code === 'P' ? 'buy' : 'sell',
      shares,
      price,
      date,
      sharesOwnedAfter: Number.isFinite(sharesOwnedAfter) ? sharesOwnedAfter : null,
      accession,
      filingUrl: indexHref,
    })
  }

  return { person: { cik: String(cik), name, title, isOfficer, isDirector }, txs }
}

const TRACKED_TICKERS = new Set(COMPANIES.map((c) => c.ticker))
// SEC's per-CIK filing list includes filings where that CIK appears as a
// >10% reporting owner of an unrelated issuer (e.g. Uber files Form 4s for
// its Aurora Innovation stake) — filter those off-scope tickers out, and
// filter out corporate/trust entities acting as reporting owners (this is a
// tracker of people, not other companies' insider stakes in third parties).
const CORPORATE_NAME_RE = /\b(Inc|LLC|L\.?L\.?C|LP|L\.?P\.?|Corp|Corporation|Trust|Fund|Partners|Ltd|Co\.|N\.V\.|PLC)\b\.?/i

async function main() {
  const peopleByCik = new Map()
  const allTxs = []

  for (const company of COMPANIES) {
    console.log(`\n== ${company.ticker} (${company.name}) ==`)
    const filings = await listRecentForm4Filings(company.cik)
    console.log(`  found ${filings.length} recent Form 4 filings`)

    for (const filing of filings) {
      const xml = await fetchPrimaryDocXml(company.cik, filing.accession)
      if (!xml) continue
      const { person, txs } = extractTransactions(xml, company.ticker, filing.accession, filing.indexHref)
      if (!person || txs.length === 0) continue
      if (CORPORATE_NAME_RE.test(person.name)) continue
      const inScopeTxs = txs.filter((t) => TRACKED_TICKERS.has(t.ticker))
      if (inScopeTxs.length === 0) continue

      if (!peopleByCik.has(person.cik)) {
        peopleByCik.set(person.cik, {
          cik: person.cik,
          name: person.name,
          roles: {},
        })
      }
      const p = peopleByCik.get(person.cik)
      const actualTicker = inScopeTxs[0].ticker
      if (!p.roles[actualTicker]) p.roles[actualTicker] = person.title

      for (const tx of inScopeTxs) {
        allTxs.push({ id: `${filing.accession}-${allTxs.length}`, ...tx })
      }
      console.log(`  + ${person.name} — ${inScopeTxs.length} P/S transaction(s) in ${filing.accession}`)
    }
  }

  // Reference price per ticker = most recent reported insider transaction price.
  const referencePrice = {}
  for (const tx of allTxs.slice().sort((a, b) => new Date(a.date) - new Date(b.date))) {
    referencePrice[tx.ticker] = { price: tx.price, asOf: tx.date }
  }

  const companiesOut = {}
  for (const c of COMPANIES) {
    companiesOut[c.ticker] = {
      name: c.name,
      sector: c.sector,
      price: referencePrice[c.ticker]?.price ?? null,
      priceAsOf: referencePrice[c.ticker]?.asOf ?? null,
    }
  }

  // Assign each person an id, initials, and a primary company (most transactions).
  const peopleOut = []
  for (const p of peopleByCik.values()) {
    const theirTxs = allTxs.filter((t) => t.personCik === p.cik)
    if (theirTxs.length === 0) continue
    const countByTicker = {}
    for (const t of theirTxs) countByTicker[t.ticker] = (countByTicker[t.ticker] || 0) + 1
    const primaryTicker = Object.entries(countByTicker).sort((a, b) => b[1] - a[1])[0][0]
    const id = slugify(p.name, p.cik)
    const initials = p.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('')

    peopleOut.push({
      id,
      cik: p.cik,
      name: p.name,
      title: p.roles[primaryTicker] ?? Object.values(p.roles)[0] ?? 'Reporting Person',
      company: primaryTicker,
      roles: p.roles,
      initials,
    })
  }

  const cikToId = new Map(peopleOut.map((p) => [p.cik, p.id]))
  const rawTxs = allTxs
    .filter((t) => cikToId.has(t.personCik))
    .map((t) => ({ ...t, personId: cikToId.get(t.personCik) }))

  // Large 10b5-1 sales are often reported as many same-day price-band tranches
  // in one filing. Aggregate those into a single row (weighted-avg price) the
  // way real insider-trading trackers do, instead of showing dozens of rows.
  const groups = new Map()
  for (const t of rawTxs) {
    const key = `${t.personId}|${t.ticker}|${t.type}|${t.date}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(t)
  }

  const txsOut = [...groups.values()].map((group) => {
    const totalShares = group.reduce((s, t) => s + t.shares, 0)
    const weightedPrice = group.reduce((s, t) => s + t.shares * t.price, 0) / totalShares
    // Lowest post-transaction balance = the state after the last tranche that day.
    const final = group.reduce((min, t) => (t.sharesOwnedAfter < min.sharesOwnedAfter ? t : min), group[0])
    const prices = group.map((t) => t.price)
    return {
      id: group[0].id,
      personId: group[0].personId,
      ticker: group[0].ticker,
      type: group[0].type,
      shares: totalShares,
      price: Math.round(weightedPrice * 100) / 100,
      priceLow: Math.min(...prices),
      priceHigh: Math.max(...prices),
      tranches: group.length,
      date: group[0].date,
      sharesOwnedAfter: final.sharesOwnedAfter,
      accession: group[0].accession,
      filingUrl: group[0].filingUrl,
    }
  })

  mkdirSync('src/data/generated', { recursive: true })
  writeFileSync('src/data/generated/companies.json', JSON.stringify(companiesOut, null, 2))
  writeFileSync('src/data/generated/people.json', JSON.stringify(peopleOut, null, 2))
  writeFileSync('src/data/generated/transactions.json', JSON.stringify(txsOut, null, 2))
  writeFileSync(
    'src/data/generated/meta.json',
    JSON.stringify({ source: 'SEC EDGAR Form 4 filings (data.sec.gov / www.sec.gov)', fetchedAt: new Date().toISOString() }, null, 2),
  )

  console.log(`\nDone. ${peopleOut.length} people, ${txsOut.length} open-market buy/sell transactions.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
