// Fetches a registered closed-end/investment fund's REAL underlying
// portfolio from its most recent SEC Form N-PORT filing — a fourth real
// disclosure type used in this project, distinct from Form 4 (individual
// trades), a 13F (an institutional MANAGER's holdings across many
// companies), and Schedule 13D/13G (a >5% stake in ONE company). N-PORT is
// what a registered fund itself must file about its OWN portfolio
// composition — for a fund like Destiny Tech100 (DXYZ) that holds private
// company stakes, this is real, disclosed exposure to companies (SpaceX,
// OpenAI, Anthropic, etc.) that never shows up in a 13F or Form 4 at all.
//
// Usage: node scripts/add-nport-fund.mjs "Display Name" FUND_CIK PERSON_ID
import { readFileSync, writeFileSync } from 'node:fs'

const USER_AGENT = 'PaperTrailResearch/1.0 (contact: research@papertrail.app)'
const REQUEST_DELAY_MS = 250

const [, , displayName, fundCik, personId] = process.argv
if (!displayName || !fundCik || !personId) {
  console.error('Usage: node scripts/add-nport-fund.mjs "Display Name" FUND_CIK PERSON_ID')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url) {
  await sleep(REQUEST_DELAY_MS)
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

function padCik(cik) {
  return String(cik).padStart(10, '0')
}

async function findLatestNport(cik) {
  const json = await fetchText(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`)
  const d = JSON.parse(json)
  const r = d.filings.recent
  const matches = []
  for (let i = 0; i < r.form.length; i += 1) {
    if (r.form[i] === 'NPORT-P') matches.push({ date: r.filingDate[i], accession: r.accessionNumber[i] })
  }
  if (matches.length === 0) return null
  matches.sort((a, b) => new Date(b.date) - new Date(a.date))
  return matches[0]
}

// SEC's N-PORT asset-category codes, translated to something readable.
const ASSET_CAT_LABEL = {
  EC: 'Equity — Common',
  EP: 'Equity — Preferred',
  STIV: 'Short-Term Investment Vehicle',
  RA: 'Repurchase Agreement',
  DBT: 'Debt',
}

function parseNport(xml) {
  const repPdDate = xml.match(/<repPdDate>([^<]+)</)?.[1]
  const holdings = []
  const blocks = [...xml.matchAll(/<invstOrSec>([\s\S]*?)<\/invstOrSec>/g)]
  for (const [, block] of blocks) {
    const name = block.match(/<name>([^<]+)</)?.[1]?.trim()
    const valUSD = block.match(/<valUSD>([\d.]+)</)?.[1]
    const pctVal = block.match(/<pctVal>([\d.]+)</)?.[1]
    const balance = block.match(/<balance>([\d.]+)</)?.[1]
    const assetCat = block.match(/<assetCat>([^<]+)</)?.[1]
    if (!name || !valUSD) continue
    // Field names match the existing 13F position shape (issuer/positionType/
    // shares/value) so the same UI table renders both without changes.
    holdings.push({
      issuer: name,
      cusip: null,
      shares: balance ? Math.round(Number(balance)) : null,
      value: Math.round(Number(valUSD)),
      positionType: ASSET_CAT_LABEL[assetCat] ?? assetCat ?? 'Position',
      percentOfFund: pctVal ? Number(pctVal) : null,
    })
  }
  holdings.sort((a, b) => b.value - a.value)
  return { asOfDate: repPdDate, holdings }
}

async function main() {
  console.log(`Fetching real Form N-PORT filing for ${displayName} (CIK ${fundCik})...`)
  const latest = await findLatestNport(fundCik)
  if (!latest) {
    console.log('No NPORT-P filing found. Nothing added.')
    return
  }
  console.log(`Found NPORT-P filed ${latest.date} (${latest.accession})`)

  const noDashes = latest.accession.replace(/-/g, '')
  const indexHtml = await fetchText(`https://www.sec.gov/Archives/edgar/data/${fundCik}/${noDashes}/`)
  const xmlHref = [...indexHtml.matchAll(/href="([^"]+primary_doc\.xml)"/g)].map((m) => m[1])[0]
  if (!xmlHref) {
    console.error('No primary_doc.xml found in this filing.')
    process.exit(1)
  }
  const xmlUrl = `https://www.sec.gov${xmlHref}`
  const xml = await fetchText(xmlUrl)
  const { asOfDate, holdings } = parseNport(xml)
  console.log(`Parsed ${holdings.length} real portfolio position(s), as of ${asOfDate}.`)

  const totalValue = holdings.reduce((s, h) => s + h.value, 0)

  const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
  let p = people.find((x) => x.id === personId)
  if (!p) {
    p = {
      id: personId,
      cik: String(fundCik),
      name: displayName,
      title: 'Registered Closed-End Fund',
      company: null,
      roles: {},
      initials: displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''),
    }
    people.push(p)
  }
  p.fund = true
  p.fundHoldings = {
    fundName: displayName,
    fundCik: String(fundCik),
    formType: 'NPORT-P',
    asOfDate,
    filingUrl: xmlUrl,
    totalValue,
    positions: holdings,
  }

  writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
  console.log(`\nDone. ${holdings.length} real N-PORT position(s) for ${displayName}, total $${(totalValue / 1e6).toFixed(1)}M.`)
  console.log('Source: SEC EDGAR Form N-PORT (the fund\'s own disclosed portfolio).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
