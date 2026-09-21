// Fetches a real 13F-HR (quarterly institutional portfolio holdings) filing
// and attaches it to a person record as `fundHoldings` — a full portfolio
// snapshot, not a stream of buy/sell events (13F doesn't report those).
// Usage: node scripts/add-fund.mjs "Fund Name" OWNER_CIK
import { readFileSync, writeFileSync } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'

const USER_AGENT = 'InsiderDeskResearch/1.0 (contact: research@insiderdesk.app)'
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true })

const [, , displayName, ownerCik] = process.argv
if (!displayName || !ownerCik) {
  console.error('Usage: node scripts/add-fund.mjs "Fund Name" OWNER_CIK')
  process.exit(1)
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

function asArray(x) {
  if (x === undefined || x === null) return []
  return Array.isArray(x) ? x : [x]
}

async function main() {
  const feedUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ownerCik}&type=13F-HR&dateb=&owner=include&count=10&output=atom`
  const feedXml = await fetchText(feedUrl)
  const feed = parser.parse(feedXml)
  const entries = asArray(feed?.feed?.entry)
  // Only genuine "13F-HR" (skip amendments like 13F-HR/A for simplicity — take the latest primary).
  const latest = entries.find((e) => e.category?.['@_term'] === '13F-HR') ?? entries[0]
  if (!latest) {
    console.log('No 13F-HR filings found.')
    return
  }
  const indexHref = latest.content['filing-href']
  const filingDate = latest.content['filing-date']
  console.log(`Latest 13F-HR: ${filingDate} — ${indexHref}`)

  const base = indexHref.replace(/\/[^/]+-index\.htm$/, '')
  const indexHtml = await fetchText(`${base}/`)
  const xmlDocs = [...indexHtml.matchAll(/href="([^"]+\.xml)"/g)].map((m) => m[1])
  // The information table doc is the one that isn't primary_doc.xml.
  const tableHref = xmlDocs.find((h) => !h.includes('primary_doc')) ?? xmlDocs[1] ?? xmlDocs[0]
  if (!tableHref) {
    console.log('No information table XML found in filing.')
    return
  }
  const tableUrl = tableHref.startsWith('http') ? tableHref : `https://www.sec.gov${tableHref}`
  console.log(`Information table: ${tableUrl}`)

  const tableXml = await fetchText(tableUrl)
  const tableDoc = parser.parse(tableXml)
  const rows = asArray(tableDoc?.informationTable?.infoTable)
  console.log(`Found ${rows.length} holdings rows`)

  const holdings = rows
    .map((r) => ({
      issuer: r.nameOfIssuer,
      cusip: r.cusip,
      shares: Number(r.shrsOrPrnAmt?.sshPrnamt) || 0,
      value: Number(r.value) || 0,
      positionType: r.putCall ?? 'Shares',
    }))
    .filter((h) => h.issuer && h.value > 0)
    .sort((a, b) => b.value - a.value)

  const totalValue = holdings.reduce((s, h) => s + h.value, 0)
  console.log(`Total reported value: $${(totalValue / 1e9).toFixed(2)}B across ${holdings.length} positions`)

  const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
  const personId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + String(ownerCik).slice(-4)
  let p = people.find((x) => x.id === personId)
  if (!p) {
    p = {
      id: personId,
      cik: String(ownerCik),
      name: displayName,
      title: 'Institutional Investment Manager',
      company: null,
      roles: {},
      initials: displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''),
    }
    people.push(p)
  }
  p.fund = true
  p.fundHoldings = {
    asOfDate: filingDate,
    filingUrl: indexHref,
    totalValue,
    positions: holdings,
  }

  writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
  console.log(`\nSaved fund portfolio for ${displayName}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
