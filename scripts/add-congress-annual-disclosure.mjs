// Fetches a member of Congress's REAL Annual Financial Disclosure Report
// (House Clerk STOCK Act system, FilingType "O" — distinct from the
// Periodic Transaction Reports add-congress-member.mjs fetches). A PTR only
// discloses individual transactions in dollar ranges and never a resulting
// position size, so it can never produce a "portfolio." The Annual Report
// is different: once a year, it discloses a full Schedule A asset list
// (real estate, LLC/business interests, mutual funds, and — critically —
// actual stock/option HOLDINGS) each with a real disclosed value RANGE.
// That's the real, sourced data this site's "portfolio" view for
// congressional members is built from.
//
// Usage: node scripts/add-congress-annual-disclosure.mjs "Last" "First" YEAR
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { XMLParser } from 'fast-xml-parser'
import { PDFParse } from 'pdf-parse'

const USER_AGENT = 'InsiderDeskResearch/1.0 (contact: research@insiderdesk.app)'
const parser = new XMLParser({ ignoreAttributes: false })

const [, , last, first, yearArg] = process.argv
if (!last || !first || !yearArg) {
  console.error('Usage: node scripts/add-congress-annual-disclosure.mjs "Last" "First" YEAR')
  process.exit(1)
}
const year = Number(yearArg)

function asArray(x) {
  if (x === undefined || x === null) return []
  return Array.isArray(x) ? x : [x]
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function findAnnualDoc(year) {
  const zipUrl = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`
  const buf = await fetchBuffer(zipUrl)
  const tmp = mkdtempSync(path.join(tmpdir(), 'housefd-'))
  const zipPath = path.join(tmp, `${year}FD.zip`)
  writeFileSync(zipPath, buf)
  execSync(`unzip -o -q "${zipPath}" -d "${tmp}"`)
  const xml = readFileSync(path.join(tmp, `${year}FD.xml`), 'utf8')
  const doc = parser.parse(xml)
  const members = asArray(doc?.FinancialDisclosure?.Member)
  // FilingType "O" = Original Annual Report (the full asset schedule).
  // Take the most recently filed one if there happen to be several
  // (amendments use "A", which we deliberately don't match here).
  const matches = members.filter(
    (m) =>
      (m.Last ?? '').toLowerCase() === last.toLowerCase() &&
      (m.First ?? '').toLowerCase() === first.toLowerCase() &&
      m.FilingType === 'O',
  )
  if (matches.length === 0) return null
  matches.sort((a, b) => new Date(b.FilingDate) - new Date(a.FilingDate))
  return { docId: matches[0].DocID, filingDate: matches[0].FilingDate, year: matches[0].Year }
}

// Every Schedule A row ends in an optional ticker, an asset-type tag like
// [ST]/[RP]/[OL], an optional owner code, and a value (a real disclosed
// RANGE, or "None" when no value was reported). The text before the tag is
// noisy (PDF extraction runs adjacent rows' trailing description/location
// text together with no real delimiter) so the row's raw name is
// best-effort only — for ticker rows we don't need it: the ticker itself
// is a clean, reliable anchor and the display name comes from our own
// companies.json lookup instead.
const ROW_RE =
  /([A-Za-z0-9.,&'()/\- ]+?)\s*(?:\(([A-Z]{1,6})\)\s*)?\[([A-Z]{2,3})\]\s*(SP|JT|Undetermined)?\s*(None|\$[\d,]+\s*-\s*\$[\d,]+)/g

const TAG_LABEL = {
  ST: 'stock',
  OP: 'option',
  RP: 'real estate',
  OL: 'business/fund interest',
  AB: 'business/fund interest',
  MF: 'mutual fund',
  PS: 'private stock',
  GS: 'government security',
}
// Bank/checking/money-market accounts are cash, not a "position" — excluded
// from the portfolio view the same way this site excludes them elsewhere.
const EXCLUDED_TAGS = new Set(['BA'])
const OWNER_LABEL = { SP: 'Spouse', JT: 'Joint', Undetermined: 'Undetermined' }

function cleanName(raw) {
  let name = raw.trim().split(/\.\s+(?=[A-Z])/).pop().trim()
  name = name
    .replace(/^(?:[\d,]+|None)\s+/, '')
    .replace(/^[A-Za-z .]+\/[A-Za-z .]+,\s*[A-Z]{2},\s*US\s+/, '')
    .replace(/^[A-Za-z .]+,\s*[A-Z]{2}\s+/, '')
    .trim()
  return name
}

function parseValue(v) {
  if (v === 'None') return { valueLow: null, valueHigh: null }
  const [lo, hi] = v
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .split('-')
    .map((s) => Number(s.trim()))
  return { valueLow: lo, valueHigh: hi }
}

function parseScheduleA(text) {
  const norm = text.replace(/[\s\0]+/g, ' ').trim()
  const rows = []
  let m
  ROW_RE.lastIndex = 0
  while ((m = ROW_RE.exec(norm))) {
    const tag = m[3]
    if (EXCLUDED_TAGS.has(tag)) continue
    const { valueLow, valueHigh } = parseValue(m[5])
    rows.push({
      name: cleanName(m[1]),
      ticker: m[2] ?? null,
      assetType: TAG_LABEL[tag] ?? tag,
      owner: OWNER_LABEL[m[4]] ?? 'Self',
      valueLow,
      valueHigh,
    })
  }
  return rows
}

async function main() {
  const displayName = `${first} ${last}`
  const found = await findAnnualDoc(year)
  if (!found) {
    console.log(`No Annual Report (FilingType "O") found for ${displayName} in ${year}FD.zip.`)
    return
  }
  const pdfUrl = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${found.year}/${found.docId}.pdf`
  console.log(`Found annual report: filed ${found.filingDate}, docId ${found.docId}`)
  const buf = await fetchBuffer(pdfUrl)
  const parsed = await new PDFParse({ data: buf }).getText()
  const text = parsed.pages.map((p) => p.text).join('\n')
  const holdings = parseScheduleA(text)
  console.log(`Parsed ${holdings.length} real Schedule A asset row(s).`)

  const lowTotal = holdings.reduce((s, h) => s + (h.valueLow ?? 0), 0)
  const highTotal = holdings.reduce((s, h) => s + (h.valueHigh ?? 0), 0)

  const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
  const personId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-congress'
  const p = people.find((x) => x.id === personId)
  if (!p) {
    console.error(`${personId} not found in people.json — run add-congress-member.mjs for ${displayName} first.`)
    process.exit(1)
  }

  p.annualAssetDisclosure = {
    formType: 'House Annual Financial Disclosure Report (STOCK Act)',
    filingYear: found.year,
    filedDate: found.filingDate,
    docId: found.docId,
    filingUrl: pdfUrl,
    holdings,
    lowTotal,
    highTotal,
  }

  writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
  console.log(
    `Done. ${holdings.length} real disclosed asset(s) for ${displayName}, ` +
      `range $${(lowTotal / 1e6).toFixed(1)}M – $${(highTotal / 1e6).toFixed(1)}M.`,
  )
  console.log('Source: House Clerk Annual Financial Disclosure Report (disclosures-clerk.house.gov).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
