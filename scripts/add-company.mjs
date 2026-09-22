// Targeted addition: fetches real Form 4 filings for ONE more company and
// merges them into the existing src/data/generated/*.json instead of
// re-running the full multi-company fetch. Usage:
//   node scripts/add-company.mjs TICKER CIK "Company Name" "Sector"
import { readFileSync, writeFileSync } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'

const USER_AGENT = 'InsiderDeskResearch/1.0 (contact: research@insiderdesk.app)'
const FILINGS_PER_COMPANY = 50
const REQUEST_DELAY_MS = 180
const parser = new XMLParser({ ignoreAttributes: false })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const [, , ticker, cik, name, sector] = process.argv
if (!ticker || !cik || !name) {
  console.error('Usage: node scripts/add-company.mjs TICKER CIK "Company Name" "Sector"')
  process.exit(1)
}

const CORPORATE_NAME_RE = /\b(Inc|LLC|L\.?L\.?C|LP|L\.?P\.?|Corp|Corporation|Trust|Fund|Partners|Ltd|Co\.|N\.V\.|PLC)\b\.?/i

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

function toBool(v) {
  return v === true || v === 1 || ['true', '1'].includes(String(v).trim().toLowerCase())
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
    .map((e) => ({ accession: e.content?.['accession-number'], indexHref: e.content?.['filing-href'] }))
    .filter((e) => e.accession && e.indexHref)
}

async function fetchPrimaryDocXml(cik, accession) {
  const dashless = accession.replaceAll('-', '')
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${dashless}`
  await sleep(REQUEST_DELAY_MS)
  const guess = await fetchText(`${base}/form4.xml`)
  if (guess) return guess
  await sleep(REQUEST_DELAY_MS)
  const indexHtml = await fetchText(`${base}/`)
  if (!indexHtml) return null
  const hrefs = [...indexHtml.matchAll(/href="([^"]+\.xml)"/g)].map((m) => m[1]).filter((h) => !h.includes('/xsl'))
  if (hrefs.length === 0) return null
  const docUrl = hrefs[0].startsWith('http') ? hrefs[0] : `https://www.sec.gov${hrefs[0]}`
  await sleep(REQUEST_DELAY_MS)
  return fetchText(docUrl)
}

function slugify(name, cik) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
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
  const issuerTicker = rawSymbol && rawSymbol.toUpperCase() !== 'NONE' ? rawSymbol : fallbackTicker

  const owner = root.reportingOwner
  const ownerObj = Array.isArray(owner) ? owner[0] : owner
  if (!ownerObj) return { person: null, txs: [] }
  const oCik = ownerObj.reportingOwnerId?.rptOwnerCik
  const oName = ownerObj.reportingOwnerId?.rptOwnerName
  if (!oCik || !oName) return { person: null, txs: [] }

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
      personCik: String(oCik),
      ticker: issuerTicker,
      type: code === 'P' ? 'buy' : 'sell',
      shares,
      price,
      date,
      sharesOwnedAfter: Number.isFinite(sharesOwnedAfter) ? sharesOwnedAfter : null,
      accession,
      filingUrl: indexHref,
    })
  }
  return { person: { cik: String(oCik), name: oName, title }, txs }
}

async function main() {
  const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
  const transactions = JSON.parse(readFileSync('src/data/generated/transactions.json', 'utf8'))
  const companies = JSON.parse(readFileSync('src/data/generated/companies.json', 'utf8'))

  // Check real data, not just a companies.json entry — an entry can exist
  // with zero transactions if a prior run failed after writing the company
  // row but before (or during) a transient SEC error on the filings fetch.
  if (companies[ticker] && transactions.some((t) => t.ticker === ticker)) {
    console.log(`${ticker} already tracked with real data. Nothing to do.`)
    return
  }

  console.log(`== ${ticker} (${name}) ==`)
  const filings = await listRecentForm4Filings(cik)
  console.log(`  found ${filings.length} recent Form 4 filings`)
  if (filings.length === 0) {
    console.log('  ! got zero filings — likely a transient SEC error, not "no data". Not writing a placeholder entry; re-run to retry.')
    return
  }

  const peopleByCik = new Map(people.map((p) => [p.cik, p]))
  const newTxs = []

  for (const filing of filings) {
    const xml = await fetchPrimaryDocXml(cik, filing.accession)
    if (!xml) continue
    const { person, txs } = extractTransactions(xml, ticker, filing.accession, filing.indexHref)
    if (!person || txs.length === 0) continue
    if (CORPORATE_NAME_RE.test(person.name)) continue

    let p = peopleByCik.get(person.cik)
    if (!p) {
      p = {
        id: slugify(person.name, person.cik),
        cik: person.cik,
        name: person.name,
        title: person.title,
        company: ticker,
        roles: {},
        initials: person.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''),
      }
      peopleByCik.set(person.cik, p)
      people.push(p)
    }
    if (!p.roles[ticker]) p.roles[ticker] = person.title

    for (const tx of txs) {
      newTxs.push({ id: `${filing.accession}-${transactions.length + newTxs.length}`, personId: p.id, ...tx })
    }
    console.log(`  + ${person.name} — ${txs.length} P/S transaction(s) in ${filing.accession}`)
  }

  // Aggregate same-day same-type tranches, same as the main fetch script.
  const groups = new Map()
  for (const t of newTxs) {
    const key = `${t.personId}|${t.ticker}|${t.type}|${t.date}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(t)
  }
  const aggregated = [...groups.values()].map((group) => {
    const totalShares = group.reduce((s, t) => s + t.shares, 0)
    const weightedPrice = group.reduce((s, t) => s + t.shares * t.price, 0) / totalShares
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

  transactions.push(...aggregated)
  const latestPrice = aggregated.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).at(-1)
  companies[ticker] = { name, sector: sector || null, price: latestPrice?.price ?? null, priceAsOf: latestPrice?.date ?? null }

  writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
  writeFileSync('src/data/generated/transactions.json', JSON.stringify(transactions, null, 2) + '\n')
  writeFileSync('src/data/generated/companies.json', JSON.stringify(companies, null, 2) + '\n')
  console.log(`\nDone. Added ${aggregated.length} transactions for ${ticker}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
