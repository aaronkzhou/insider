// Fetches REAL Periodic Transaction Reports (PTRs) for a member of Congress
// from the House Clerk's public financial disclosure system — a completely
// different filing system than SEC EDGAR (STOCK Act disclosures, not
// corporate Form 4s). Spousal trades ("SP" owner) are real too — that's how
// a member's spouse's trading shows up in the public record at all.
//
// Amounts here are DISCLOSED RANGES (e.g. "$1,000,001 - $5,000,000"), not
// exact dollar figures like SEC Form 4 — the law only requires a range, so
// we store both bounds and never invent a precise number. There's also no
// "shares owned after" figure — PTRs disclose the transaction, not the
// resulting position — so no portfolio/holdings value can be computed here.
//
// Usage: node scripts/add-congress-member.mjs "Last" "First" YEAR [YEAR...]
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { XMLParser } from 'fast-xml-parser'
import { PDFParse } from 'pdf-parse'

const USER_AGENT = 'InsiderDeskResearch/1.0 (contact: research@insiderdesk.app)'
const REQUEST_DELAY_MS = 300
const parser = new XMLParser({ ignoreAttributes: false })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const rawArgs = process.argv.slice(2)
const spouseFlag = rawArgs.find((a) => a.startsWith('--spouse='))
const spouseName = spouseFlag ? spouseFlag.slice('--spouse='.length) : null
const [last, first, ...years] = rawArgs.filter((a) => !a.startsWith('--'))
if (!last || !first || years.length === 0) {
  console.error('Usage: node scripts/add-congress-member.mjs "Last" "First" YEAR [YEAR...] [--spouse="Full Name"]')
  process.exit(1)
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function asArray(x) {
  if (x === undefined || x === null) return []
  return Array.isArray(x) ? x : [x]
}

async function listPtrDocIds(year) {
  const zipUrl = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`
  const buf = await fetchBuffer(zipUrl)
  const tmp = mkdtempSync(path.join(tmpdir(), 'housefd-'))
  const zipPath = path.join(tmp, `${year}FD.zip`)
  writeFileSync(zipPath, buf)
  execSync(`unzip -o -q "${zipPath}" -d "${tmp}"`)
  const xml = readFileSync(path.join(tmp, `${year}FD.xml`), 'utf8')
  const doc = parser.parse(xml)
  const members = asArray(doc?.FinancialDisclosure?.Member)
  return members
    .filter(
      (m) =>
        (m.Last ?? '').toLowerCase() === last.toLowerCase() &&
        (m.First ?? '').toLowerCase() === first.toLowerCase() &&
        m.FilingType === 'P',
    )
    .map((m) => ({ docId: m.DocID, filingDate: m.FilingDate, year }))
}

const OWNER_LABEL = { SP: 'Spouse', JT: 'Joint', DC: 'Dependent Child' }
const TXTYPE_LABEL = { P: 'buy', S: 'sell', E: 'exchange' }

function mdyToIso(mdy) {
  const [mo, d, y] = mdy.split('/')
  return `${y}-${mo}-${d}`
}

// Row header always sits immediately before its anchor (owner?, asset name,
// optional (TICKER), [TYPE]) — so anchoring the regex to the END of the
// slice between two anchors should find THIS row's header. But a plain lazy
// match starts as early as possible, and since "Filing Status: New
// Description: ..." (the PREVIOUS row's trailing text) contains no `[` or
// `$`, a naive character class happily swallows it whole. Block the asset
// name from ever starting inside or spanning one of those marker phrases.
const FORBIDDEN =
  'Purchased|Sold|Filing Status|Description|expiration date|strike price|Exchanged|' +
  'Exercised|Contribution|No shares|Sale of|Additional investment|Transfer|Redemption|Loss of|Gain of'
const ASSET_CHAR = `(?:(?!${FORBIDDEN})[^[$:])`
// The lookahead has to guard the mandatory first letter too — otherwise the
// match can start right at the capital "P" of "Purchased" itself (a valid
// uppercase start the character-class guard never gets a chance to block).
const HEADER_RE = new RegExp(
  `(?:\\b(SP|JT|DC)\\b\\s+)?(?!${FORBIDDEN})([A-Z]${ASSET_CHAR}{1,150}?)(?:\\s*\\(([A-Z.]{1,6})\\))?\\s*\\[([A-Z]{2,4})\\]\\s*$`,
)

function parsePtrText(text) {
  const norm = text.replace(/[\s\0]+/g, ' ').trim()
  const anchorRe = /([PSE])\s+(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+\$([\d,]+)\s*-\s*\$([\d,]+)/g
  const anchors = [...norm.matchAll(anchorRe)]
  if (anchors.length === 0) return []

  const tableStart = norm.indexOf('$200?')
  const sectionStart = tableStart >= 0 ? tableStart + 5 : 0

  // Pass 1: find each row's header and its absolute start position.
  const headers = anchors.map((anchor, i) => {
    const blobStart = i === 0 ? sectionStart : anchors[i - 1].index + anchors[i - 1][0].length
    const blob = norm.slice(blobStart, anchor.index)
    const m = blob.match(HEADER_RE)
    if (!m) return null
    // Safety net for description phrasing the forbidden-word list doesn't
    // anticipate: if a leaked description sentence still snuck in, the real
    // asset name is whatever comes after the LAST ". SP "/". JT "/". DC "
    // (the true header always starts with the owner code right after a
    // sentence boundary).
    const asset = m[2].trim().replace(/^.*\.\s+(?:SP|JT|DC)\s+/, '')
    return {
      owner: OWNER_LABEL[m[1]] ?? 'Self',
      asset,
      ticker: m[3] ?? null,
      assetType: m[4],
      absoluteStart: blobStart + m.index,
    }
  })

  const sectionEnd = (() => {
    const idx = norm.indexOf('Initial Public Offering')
    return idx >= 0 ? idx : norm.length
  })()

  // Pass 2: each row's description is the text after its own anchor, up to
  // the next row's header start (or end of the transactions section).
  return anchors
    .map((anchor, i) => {
      const h = headers[i]
      if (!h) return null
      const descStart = anchor.index + anchor[0].length
      // If the immediately-next header failed to parse, don't fall all the
      // way through to the end of the document (which would swallow every
      // remaining row's text, including trailing certification boilerplate)
      // — use the next header that DID parse instead.
      const nextHeader = headers.slice(i + 1).find((h) => h)
      const descEnd = nextHeader?.absoluteStart ?? sectionEnd
      const descRaw = norm.slice(descStart, Math.max(descStart, descEnd))
      // Small-caps "Description:" styling nulls out most letters on
      // extraction, leaving just "D :" — match that instead of the word.
      const descMatch = descRaw.match(/\bD\s*:\s*(.*?)\s*$/)
      let description = descMatch ? descMatch[1].trim() : descRaw.trim() || null
      // A real PTR description sentence is a line or two. Anything wildly
      // longer means the boundary search failed and swallowed extra rows
      // (or the trailing certification block) — cut it rather than show it.
      if (description && description.length > 240) description = `${description.slice(0, 240)}…`
      const sharesMatch = description?.match(/(?:Purchased|Sold)\s+([\d,]+)\s+shares/i)

      return {
        owner: h.owner,
        asset: h.asset,
        ticker: h.ticker,
        assetType: h.assetType,
        type: TXTYPE_LABEL[anchor[1]] ?? anchor[1],
        date: mdyToIso(anchor[2]),
        amountLow: Number(anchor[3].replace(/,/g, '')),
        amountHigh: Number(anchor[4].replace(/,/g, '')),
        description,
        shares: sharesMatch ? Number(sharesMatch[1].replace(/,/g, '')) : null,
      }
    })
    .filter(Boolean)
}

async function main() {
  const displayName = `${first} ${last}`
  const personId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-congress'

  let allDocs = []
  for (const year of years) {
    await sleep(REQUEST_DELAY_MS)
    const docs = await listPtrDocIds(year)
    console.log(`${year}: found ${docs.length} PTR filing(s)`)
    allDocs.push(...docs)
  }

  const trades = []
  for (const { docId, filingDate, year } of allDocs) {
    await sleep(REQUEST_DELAY_MS)
    const pdfUrl = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${docId}.pdf`
    let buf
    try {
      buf = await fetchBuffer(pdfUrl)
    } catch (err) {
      console.warn(`  ! ${docId}: ${err.message}`)
      continue
    }
    const parsed = await new PDFParse({ data: buf }).getText()
    const text = parsed.pages.map((p) => p.text).join('\n')
    const rows = parsePtrText(text)
    console.log(`  ${docId} (filed ${filingDate}): ${rows.length} transaction row(s)`)
    for (const r of rows) {
      trades.push({ ...r, personId, docId, filingUrl: pdfUrl })
    }
  }

  const hasSpouseTrades = trades.some((t) => t.owner === 'Spouse')
  const combinedName = spouseName && hasSpouseTrades ? `${displayName} & ${spouseName}` : displayName

  const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
  let p = people.find((x) => x.id === personId)
  if (!p) {
    p = {
      id: personId,
      cik: null,
      name: combinedName,
      title: 'Member of Congress',
      company: null,
      roles: {},
      initials: combinedName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''),
    }
    people.push(p)
  }
  // Keep the display name current even on repeat runs (e.g. once spousal
  // trades first appear, or if it was created before --spouse was passed).
  p.name = combinedName
  p.initials = combinedName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  if (spouseName && hasSpouseTrades) {
    p.title = `Member of Congress — trades below include disclosed transactions by spouse ${spouseName}`
  }
  p.congressional = true
  p.congressionalTrades = trades.sort((a, b) => new Date(b.date) - new Date(a.date))

  writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
  console.log(`\nDone. ${trades.length} real congressional PTR transaction row(s) for ${displayName}.`)
  console.log('Source: House Clerk STOCK Act disclosures (disclosures-clerk.house.gov). Amounts are disclosed RANGES, not exact figures.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
