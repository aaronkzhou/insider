// Scans SEC EDGAR's real-time market-wide Form 4 firehose (NOT scoped to
// our tracked company list) for stocks with unusually many distinct
// insiders filing together recently — a cluster signal on a company we
// aren't otherwise tracking. Cheap: each filing shows up as two linked
// atom entries (reporting owner + issuer, tied by accession number), so
// this only needs the firehose feed itself, no per-filing XML fetches.
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

  const alerts = [...byIssuer.values()]
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

  console.log(`Found ${alerts.length} untracked companies with ${MIN_INSIDERS}+ recent distinct insider filers:`)
  for (const a of alerts) {
    console.log(`  ${a.ticker ?? '(no ticker)'} — ${a.companyName} — ${a.insiderCount} insiders`)
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
