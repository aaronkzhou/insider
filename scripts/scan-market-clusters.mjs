// Scans SEC EDGAR's real-time market-wide Form 4 firehose (NOT scoped to
// our tracked company list) for stocks with unusually many distinct
// insiders filing together recently — a cluster signal on a company we
// aren't otherwise tracking. The firehose itself is cheap (each filing is
// two linked atom entries — reporting owner + issuer, tied by an accession
// number — no XML needed just to find candidates), but most clusters turn
// out to be routine same-day equity vesting rather than real trading, so
// candidates that clear the insider-count threshold get one further XML
// fetch per filing to find the real P/S code and confirm actual buying or
// selling is behind it before it's surfaced as an alert.
import { readFileSync, writeFileSync } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'

const USER_AGENT = 'InsiderDeskResearch/1.0 (contact: research@insiderdesk.app)'
const PAGES = 5 // 100 entries each = up to 250 filings (2 entries per filing)
const MIN_INSIDERS = 3
const parser = new XMLParser({ ignoreAttributes: false })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function asArray(x) {
  if (x === undefined || x === null) return []
  return Array.isArray(x) ? x : [x]
}

async function fetchPrimaryDocXml(indexUrl) {
  const base = indexUrl.replace(/\/[^/]+-index\.htm$/, '')
  const guess = await fetchText(`${base}/form4.xml`).catch(() => null)
  if (guess) return guess
  const indexHtml = await fetchText(`${base}/`).catch(() => null)
  if (!indexHtml) return null
  const hrefs = [...indexHtml.matchAll(/href="([^"]+\.xml)"/g)].map((m) => m[1]).filter((h) => !h.includes('/xsl'))
  if (hrefs.length === 0) return null
  const docUrl = hrefs[0].startsWith('http') ? hrefs[0] : `https://www.sec.gov${hrefs[0]}`
  return fetchText(docUrl).catch(() => null)
}

/** Real transaction code (P/S) from the filing itself — the firehose titles
 * alone don't say whether a filer bought or sold. */
async function fetchTransactionDetail(indexUrl) {
  const xml = await fetchPrimaryDocXml(indexUrl)
  if (!xml) return { type: null, date: null }
  let doc
  try {
    doc = parser.parse(xml)
  } catch {
    return { type: null, date: null }
  }
  const rows = asArray(doc?.ownershipDocument?.nonDerivativeTable?.nonDerivativeTransaction)
  // Prefer the real P/S trade's own date; fall back to whatever's there.
  let fallbackDate = null
  for (const row of rows) {
    const code = row.transactionCoding?.transactionCode
    const date = row.transactionDate?.value ?? null
    if (code === 'P') return { type: 'buy', date }
    if (code === 'S') return { type: 'sell', date }
    fallbackDate ??= date
  }
  return { type: 'other', date: fallbackDate } // award, gift, exercise, etc. — real, just not a market trade
}

async function fetchFirehosePage(start) {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=100&start=${start}&output=atom`
  const xml = await fetchText(url)
  const doc = parser.parse(xml)
  return asArray(doc?.feed?.entry)
}

// The feed double-escapes entities (e.g. literal "&#39;" text, not a real
// apostrophe), so fast-xml-parser's one decode pass leaves it as-is.
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parseTitle(title) {
  // "4 - Young Wendy B. (0002042847) (Reporting)" or "... (Issuer)"
  const m = title.match(/^4\s*-\s*(.+?)\s*\((\d+)\)\s*\((Reporting|Issuer)\)\s*$/)
  if (!m) return null
  return { name: decodeEntities(m[1].trim()), cik: m[2], role: m[3] }
}

async function main() {
  const byAccession = new Map()

  for (let page = 0; page < PAGES; page += 1) {
    await sleep(200)
    let entries
    try {
      entries = await fetchFirehosePage(page * 100)
    } catch (err) {
      console.warn(`  ! page ${page}: ${err.message}`)
      continue
    }
    for (const e of entries) {
      const parsed = parseTitle(e.title ?? '')
      if (!parsed) continue
      const accession = e.id?.match(/accession-number=([\d-]+)/)?.[1]
      if (!accession) continue
      if (!byAccession.has(accession)) {
        byAccession.set(accession, { accession, filingUrl: e.link?.['@_href'] })
      }
      const rec = byAccession.get(accession)
      if (parsed.role === 'Issuer') {
        rec.issuerName = parsed.name
        rec.issuerCik = parsed.cik
      } else {
        rec.ownerName = parsed.name
        rec.ownerCik = parsed.cik
      }
    }
  }

  console.log(`Parsed ${byAccession.size} filings from the firehose.`)

  const companies = JSON.parse(readFileSync('src/data/generated/companies.json', 'utf8'))
  const tickerByCik = JSON.parse(await fetchText('https://www.sec.gov/files/company_tickers.json'))
  const cikToTicker = new Map()
  for (const row of Object.values(tickerByCik)) {
    cikToTicker.set(String(Number(row.cik_str)), row.ticker)
  }
  const trackedTickers = new Set(Object.keys(companies))

  const byIssuer = new Map()
  for (const rec of byAccession.values()) {
    if (!rec.issuerCik || !rec.ownerCik) continue
    if (!byIssuer.has(rec.issuerCik)) {
      byIssuer.set(rec.issuerCik, { issuerName: rec.issuerName, issuerCik: rec.issuerCik, owners: new Map() })
    }
    byIssuer.get(rec.issuerCik).owners.set(rec.ownerCik, { name: rec.ownerName, filingUrl: rec.filingUrl })
  }

  const candidates = [...byIssuer.values()]
    .map((g) => {
      const ticker = cikToTicker.get(String(Number(g.issuerCik))) ?? null
      return {
        ticker,
        companyName: g.issuerName,
        cik: g.issuerCik,
        insiderCount: g.owners.size,
        insiders: [...g.owners.values()],
        tracked: ticker ? trackedTickers.has(ticker) : false,
      }
    })
    .filter((a) => a.insiderCount >= MIN_INSIDERS && !a.tracked)
    .sort((a, b) => b.insiderCount - a.insiderCount)

  console.log(`Found ${candidates.length} untracked companies with ${MIN_INSIDERS}+ recent distinct insider filers.`)
  console.log('Fetching each filing to determine real buy/sell direction...')

  // Only look up direction for the companies that actually cleared the
  // cluster threshold — fetching every filing in the firehose isn't needed.
  const alerts = []
  for (const a of candidates) {
    let buys = 0
    let sells = 0
    let other = 0
    for (const insider of a.insiders) {
      await sleep(150)
      const { type, date } = await fetchTransactionDetail(insider.filingUrl).catch(() => ({ type: null, date: null }))
      insider.type = type
      insider.date = date
      if (type === 'buy') buys += 1
      else if (type === 'sell') sells += 1
      else other += 1
    }
    // Most clusters turn out to be routine same-day equity vesting (every
    // exec filing an "other" event, not a market trade) — real signal only
    // exists when there's actual open-market buying or selling behind it.
    if (buys + sells < 2) {
      console.log(`  (skip) ${a.ticker ?? a.companyName} — ${a.insiderCount} insiders but all routine (award/exercise/gift), no real trading`)
      continue
    }
    const direction = buys > sells ? 'buy' : sells > buys ? 'sell' : 'mixed'
    alerts.push({ ...a, buys, sells, other, direction })
    console.log(`  ${a.ticker ?? '(no ticker)'} — ${a.companyName} — ${a.insiderCount} insiders (${buys} buy, ${sells} sell, ${other} other)`)
  }

  writeFileSync(
    'src/data/generated/market-alerts.json',
    JSON.stringify({ scannedAt: new Date().toISOString(), filingsScanned: byAccession.size, alerts }, null, 2) + '\n',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
