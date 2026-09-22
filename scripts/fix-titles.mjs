// One-off patch: re-derives each person's title/roles from a fresh fetch of
// one real filing per (person, ticker) pair, using the corrected boolean
// parser (see fetch-sec-data.mjs). Much cheaper than a full re-fetch.
import { readFileSync, writeFileSync } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'

const USER_AGENT = 'PaperTrailResearch/1.0 (contact: research@papertrail.app)'
const REQUEST_DELAY_MS = 150
const parser = new XMLParser({ ignoreAttributes: false })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch {
      if (attempt === tries) return null
      await sleep(300 * attempt)
    }
  }
  return null
}

function toBool(v) {
  return v === true || v === 1 || ['true', '1'].includes(String(v).trim().toLowerCase())
}

async function titleFromFiling(indexUrl) {
  await sleep(REQUEST_DELAY_MS)
  const indexHtml = await fetchText(indexUrl)
  if (!indexHtml) return null
  const hrefs = [...indexHtml.matchAll(/href="([^"]+\.xml)"/g)].map((m) => m[1]).filter((h) => !h.includes('/xsl'))
  if (hrefs.length === 0) return null
  const docUrl = hrefs[0].startsWith('http') ? hrefs[0] : `https://www.sec.gov${hrefs[0]}`

  await sleep(REQUEST_DELAY_MS)
  const xml = await fetchText(docUrl)
  if (!xml) return null

  let doc
  try {
    doc = parser.parse(xml)
  } catch {
    return null
  }
  const owner = doc?.ownershipDocument?.reportingOwner
  const ownerObj = Array.isArray(owner) ? owner[0] : owner
  const rel = ownerObj?.reportingOwnerRelationship ?? {}
  const isOfficer = toBool(rel.isOfficer)
  const isDirector = toBool(rel.isDirector)
  const isTenPercent = toBool(rel.isTenPercentOwner)

  if (isOfficer && rel.officerTitle) return rel.officerTitle
  if (isDirector) return 'Director'
  if (isTenPercent) return '10% Owner'
  return 'Reporting Person'
}

async function main() {
  const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
  const transactions = JSON.parse(readFileSync('src/data/generated/transactions.json', 'utf8'))

  let changed = 0
  for (const person of people) {
    const theirTxs = transactions.filter((t) => t.personId === person.id)
    const newRoles = {}
    for (const ticker of Object.keys(person.roles)) {
      const latest = theirTxs
        .filter((t) => t.ticker === ticker)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
      if (!latest?.filingUrl) {
        newRoles[ticker] = person.roles[ticker]
        continue
      }
      const title = await titleFromFiling(latest.filingUrl)
      newRoles[ticker] = title ?? person.roles[ticker]
      process.stdout.write('.')
    }
    const newPrimaryTitle = newRoles[person.company] ?? person.title
    if (newPrimaryTitle !== person.title || JSON.stringify(newRoles) !== JSON.stringify(person.roles)) {
      changed += 1
    }
    person.title = newPrimaryTitle
    person.roles = newRoles
  }

  writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
  console.log(`\nDone. Updated titles for ${changed}/${people.length} people.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
