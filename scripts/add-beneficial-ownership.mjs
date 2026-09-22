// Fetches REAL Schedule 13D/13G beneficial-ownership filings for a given
// reporting person/entity — a third SEC disclosure type, distinct from
// Form 4 (requires an officer/director/10%-owner ROLE at one company,
// reports individual trades) and a 13F (an institutional manager's
// quarterly holdings report). Any person or entity that crosses 5%
// beneficial ownership of a public company's stock files one; this script
// finds every one they've ever filed and keeps only the most recent per
// issuer, since each filing is a point-in-time snapshot, not a
// continuously updated feed.
//
// SEC has used two different structured XML schemas for these over time
// (13D and 13G use different tag names from each other), and filings
// before SEC mandated structured data are plain HTML with no machine-
// readable tags at all — this handles both schemas and falls back to
// regex-parsing the HTML text for older filings, the same way a person
// reading the PDF/HTML by eye would.
//
// Usage: node scripts/add-beneficial-ownership.mjs "Filer Name" OWNER_CIK [--person-id=existing-id]
//
// "Filer Name" must match the name AS IT APPEARS IN THE 13D/13G FILINGS
// (natural order, e.g. "Peter Thiel") — that's what's used to find this
// filer's own row among possibly several reporting persons on one filing.
// That's often NOT the same spelling as the existing person.json record
// (SEC's Form 4 filer-name convention is "LAST FIRST", e.g. "THIEL PETER"),
// so pass --person-id to attach the data to a specific existing record
// instead of relying on a name match.
import { readFileSync, writeFileSync } from 'node:fs'

const USER_AGENT = 'PaperTrailResearch/1.0 (contact: research@papertrail.app)'
const REQUEST_DELAY_MS = 250

const rawArgs = process.argv.slice(2)
const personIdFlag = rawArgs.find((a) => a.startsWith('--person-id='))
const overridePersonId = personIdFlag ? personIdFlag.slice('--person-id='.length) : null
const [displayName, ownerCik] = rawArgs.filter((a) => !a.startsWith('--'))
if (!displayName || !ownerCik) {
  console.error('Usage: node scripts/add-beneficial-ownership.mjs "Filer Name" OWNER_CIK [--person-id=existing-id]')
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

async function listOwnershipFilings(cik) {
  const json = await fetchText(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`)
  const d = JSON.parse(json)
  const r = d.filings.recent
  const out = []
  for (let i = 0; i < r.form.length; i += 1) {
    // Naming has been inconsistent over the years: "SC 13D", "SCHEDULE
    // 13D", and their "/A" amendments all show up for the same real form.
    if (/^(SC|SCHEDULE) 13[DG](\/A)?$/.test(r.form[i])) {
      out.push({ form: r.form[i], date: r.filingDate[i], accession: r.accessionNumber[i] })
    }
  }
  out.sort((a, b) => new Date(a.date) - new Date(b.date))
  return out
}

// Returns every real candidate document for this filing, most-likely-correct
// first, so the caller can try each until one actually parses. A filing
// commonly has SEVERAL real .htm documents (the 13D/13G form itself, plus
// exhibits like a joint-filing agreement) — picking blindly can grab the
// wrong one, so callers should try in order rather than trust the first.
async function findCandidateDocs(cik, accession) {
  const noDashes = accession.replace(/-/g, '')
  const indexHtml = await fetchText(`https://www.sec.gov/Archives/edgar/data/${cik}/${noDashes}/`)
  if (!indexHtml) return []
  const xmlHref = [...indexHtml.matchAll(/href="([^"]+primary_doc\.xml)"/g)].map((m) => m[1])[0]
  if (xmlHref) return [{ type: 'xml', url: `https://www.sec.gov${xmlHref}` }]
  // Older filings have no structured XML — just real .htm/.txt document(s).
  // The index page also links to SEC's own site chrome (nav, footer, etc.)
  // with plain-looking hrefs like "/index.htm" — restrict to links that are
  // actually inside this filing's own Archives path.
  const filingPathPrefix = `/Archives/edgar/data/${cik}/${noDashes}/`
  const candidates = [...indexHtml.matchAll(/href="([^"]+\.(?:htm|txt))"/g)]
    .map((m) => m[1])
    .filter((h) => h.startsWith(filingPathPrefix) && !h.endsWith('-index.htm'))
  // A filename containing "13g"/"13d" is almost always the actual form,
  // as opposed to an exhibit (joint filing agreement, cover letter, etc.)
  // — try those first, then any other .htm, then the raw .txt as a last resort.
  const score = (h) => (/13[gd]/i.test(h) ? 0 : h.endsWith('.htm') ? 1 : 2)
  return candidates.sort((a, b) => score(a) - score(b)).map((h) => ({ type: 'html', url: `https://www.sec.gov${h}` }))
}

function stripTags(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#160;|&nbsp;|&#8239;|&#168;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Tries the 13D structured schema, then 13G's (different tag names), then
// falls back to plain-text pattern matching for pre-structured-data HTML.
const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase()

function parseFiling(raw, type, reportingPersonName) {
  const targetName = norm(reportingPersonName)
  if (type === 'xml') {
    const issuerName = raw.match(/<issuerName>([^<]+)</)?.[1]?.trim()
    const issuerCik = raw.match(/<issuerCIK>(\d+)</)?.[1] ?? raw.match(/<issuerCik>(\d+)</)?.[1]
    const eventDate =
      raw.match(/<dateOfEvent>([^<]+)</)?.[1] ?? raw.match(/<eventDateRequiresFilingThisStatement>([^<]+)</)?.[1]

    // 13D: <reportingPersons><reportingPersonInfo>...<reportingPersonName>
    // ...<aggregateAmountOwned>...<percentOfClass>...</reportingPersonInfo>
    const rpBlocks13D = [...raw.matchAll(/<reportingPersonInfo>([\s\S]*?)<\/reportingPersonInfo>/g)]
    for (const [, block] of rpBlocks13D) {
      const name = block.match(/<reportingPersonName>([^<]+)</)?.[1]?.trim()
      if (!name || norm(name) !== targetName) continue
      const shares = block.match(/<aggregateAmountOwned>([\d.]+)</)?.[1]
      const percent = block.match(/<percentOfClass>([\d.]+)</)?.[1]
      if (shares && percent) {
        return { issuerName, issuerCik, eventDate, shares: Math.round(Number(shares)), percent: Number(percent) }
      }
    }

    // 13G: <coverPageHeaderReportingPersonDetails>...<reportingPersonName>
    // ...<reportingPersonBeneficiallyOwnedAggregateNumberOfShares>
    // ...<classPercent>...
    const rpBlocks13G = [...raw.matchAll(/<coverPageHeaderReportingPersonDetails>([\s\S]*?)(?=<coverPageHeaderReportingPersonDetails>|<\/formData>)/g)]
    for (const [, block] of rpBlocks13G) {
      const name = block.match(/<reportingPersonName>([^<]+)</)?.[1]?.trim()
      if (!name || norm(name) !== targetName) continue
      const shares = block.match(/<reportingPersonBeneficiallyOwnedAggregateNumberOfShares>([\d.]+)</)?.[1]
      const percent = block.match(/<classPercent>([\d.]+)</)?.[1]
      if (shares && percent) {
        return { issuerName, issuerCik, eventDate, shares: Math.round(Number(shares)), percent: Number(percent) }
      }
    }
    return null
  }

  // Old-format HTML: no per-person tags, just a flat sequence of numbered
  // cover-page items repeated once per reporting person. Take the first
  // "AGGREGATE AMOUNT ... PERCENT OF CLASS" pair after the person's name —
  // good enough for the primary filer, which is what we're after.
  const text = stripTags(raw)
  const nameIdx = text.indexOf(reportingPersonName)
  const search = nameIdx >= 0 ? text.slice(nameIdx) : text
  const shares = search.match(/AGGREGATE AMOUNT (?:BENEFICIALLY )?OWNED BY EACH REPORTING PERSON\s*([\d,]+)/i)?.[1]
  const percent = search.match(/PERCENT(?:AGE)? OF CLASS(?: REPRESENTED BY AMOUNT IN ROW \(\d+\))?\s*([\d.]+)\s*%/i)?.[1]
  const issuerName = text.match(/\(Name of Issuer\)/i)
    ? text.slice(0, text.indexOf('(Name of Issuer)')).trim().split(/\s{2,}|\n/).pop()
    : null
  if (!shares || !percent) return null
  return { issuerName, issuerCik: null, eventDate: null, shares: Number(shares.replace(/,/g, '')), percent: Number(percent) }
}

async function resolveIssuer(accession, issuerCik, issuerNameGuess) {
  // EDGAR full text search keyed on the accession number — reliable even
  // even for the old HTML filings where no issuer CIK is available at all.
  const json = await fetchText(`https://efts.sec.gov/LATEST/search-index?q=%22${accession}%22`)
  if (!json) return null
  const hits = JSON.parse(json)?.hits?.hits ?? []
  if (hits.length === 0) return null
  const names = hits[0]._source.display_names ?? []
  const issuerLine = names.find((n) => !n.includes(`CIK ${String(issuerCik ?? '').padStart(10, '0')}`) && n !== `${issuerNameGuess}`)
  // display_names format: "Company Name  (TICKER)  (CIK 0001234567)"
  const match = (issuerLine ?? names[0] ?? '').match(/^(.+?)\s*(?:\(([A-Z.]+(?:,\s*[A-Z.]+)*)\))?\s*\(CIK (\d+)\)$/)
  if (!match) return null
  return { name: match[1].trim(), ticker: match[2]?.split(',')[0]?.trim() ?? null, cik: match[3] }
}

async function buildCikToTicker() {
  const json = await fetchText('https://www.sec.gov/files/company_tickers.json')
  const data = JSON.parse(json)
  const map = new Map()
  // A CIK can have several tickers (common stock, warrants, rights, a
  // secondary class) — the common-stock ticker is essentially always the
  // shortest one, so prefer that over whichever happened to sort last.
  for (const v of Object.values(data)) {
    const cik = String(v.cik_str)
    const existing = map.get(cik)
    if (!existing || v.ticker.length < existing.length) map.set(cik, v.ticker)
  }
  return map
}

async function main() {
  console.log(`Fetching real Schedule 13D/13G filings for ${displayName} (CIK ${ownerCik})...`)
  const filings = await listOwnershipFilings(ownerCik)
  console.log(`Found ${filings.length} 13D/13G filing(s).`)
  const cikToTicker = await buildCikToTicker()

  // issuer key -> array of {date, shares, percent, filingType, filingUrl}
  const byIssuer = new Map()

  for (const f of filings) {
    const candidates = await findCandidateDocs(ownerCik, f.accession)
    if (candidates.length === 0) {
      console.warn(`  ! ${f.accession}: couldn't find any candidate document, skipping`)
      continue
    }
    let parsed = null
    let usedDoc = null
    for (const doc of candidates) {
      const raw = await fetchText(doc.url)
      if (!raw) continue
      const attempt = parseFiling(raw, doc.type, displayName)
      // A real 0-share/0% row is a valid outcome (a full divestiture) — use
      // != null, not truthiness, so it isn't mistaken for a failed parse.
      if (attempt && attempt.shares != null && attempt.percent != null) {
        parsed = attempt
        usedDoc = doc
        break
      }
    }
    if (!parsed) {
      console.warn(`  ! ${f.accession} (${f.form}): couldn't parse a real share/percent figure from any candidate document, skipping`)
      continue
    }
    const doc = usedDoc

    let issuer = null
    if (parsed.issuerCik) {
      issuer = { name: parsed.issuerName, ticker: cikToTicker.get(String(Number(parsed.issuerCik))) ?? null, cik: parsed.issuerCik }
    } else {
      issuer = await resolveIssuer(f.accession, parsed.issuerCik, displayName)
    }
    if (!issuer) {
      console.warn(`  ! ${f.accession}: couldn't resolve the issuer, skipping`)
      continue
    }
    const key = issuer.cik ?? issuer.name
    if (!byIssuer.has(key)) byIssuer.set(key, { issuer, rows: [] })
    byIssuer.get(key).rows.push({
      date: f.date,
      shares: parsed.shares,
      percent: parsed.percent,
      filingType: f.form.startsWith('SCHEDULE') ? f.form.replace('SCHEDULE', 'Schedule') : `Schedule ${f.form.slice(3)}`,
      filingUrl: doc.url,
    })
    console.log(`  + ${issuer.name}: ${parsed.shares.toLocaleString()} sh (${parsed.percent}%) as of ${f.date} [${f.accession}]`)
  }

  const positions = []
  for (const { issuer, rows } of byIssuer.values()) {
    rows.sort((a, b) => new Date(a.date) - new Date(b.date))
    const latest = rows[rows.length - 1]
    const prev = rows[rows.length - 2]
    let note = null
    if (prev && Math.abs(latest.shares - prev.shares) / prev.shares > 0.2) {
      const direction = latest.shares < prev.shares ? 'Reduced' : 'Increased'
      note = `${direction} from ${prev.shares.toLocaleString()} shares (${prev.percent}%) as of ${prev.date} — a real, disclosed change.`
    }
    positions.push({
      ticker: issuer.ticker,
      companyName: issuer.name,
      shares: latest.shares,
      percentOfClass: latest.percent,
      asOfDate: latest.date,
      filingType: latest.filingType,
      filingUrl: latest.filingUrl,
      ...(note ? { note } : {}),
    })
  }
  positions.sort((a, b) => b.shares * (b.percentOfClass || 1) - a.shares * (a.percentOfClass || 1))

  const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
  const guessedId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const p = overridePersonId
    ? people.find((x) => x.id === overridePersonId)
    : people.find((x) => x.name.toLowerCase() === displayName.toLowerCase() || x.id.startsWith(guessedId))
  if (!p) {
    console.error(
      overridePersonId
        ? `No person with id "${overridePersonId}" found in people.json.`
        : `No existing person found matching "${displayName}" in people.json — pass --person-id= or run add-person.mjs/add-fund.mjs first.`,
    )
    process.exit(1)
  }
  p.beneficialOwnership = positions

  const companies = JSON.parse(readFileSync('src/data/generated/companies.json', 'utf8'))
  for (const pos of positions) {
    const key = pos.ticker ?? pos.companyName
    if (!companies[key]) {
      companies[key] = { name: pos.companyName, sector: null, price: null, priceAsOf: null }
    }
  }

  writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
  writeFileSync('src/data/generated/companies.json', JSON.stringify(companies, null, 2) + '\n')
  console.log(`\nDone. ${positions.length} real beneficial-ownership position(s) for ${p.name}.`)
  console.log('Source: SEC EDGAR Schedule 13D/13G filings.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
