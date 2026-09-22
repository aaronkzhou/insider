// One-off: attaches REAL data read directly from JD Vance's actual OGE Form
// 278e (Executive Branch Personnel Public Financial Disclosure Report),
// 2024 annual report, filed 2025-06-12, certified 2025-06-13. Source:
// https://www.whitehouse.gov/wp-content/uploads/2025/06/Vice-President-JD-Vance.pdf
//
// This is a THIRD disclosure system, distinct from SEC EDGAR (Form 4) and
// the House Clerk STOCK Act PTRs — the executive branch's own financial
// disclosure regime (5 C.F.R. part 2634), which reports value RANGES, not
// exact figures, same general shape as congressional PTRs but a snapshot of
// holdings (like a 13F) rather than a transaction stream, plus one real
// reported transaction. Every figure below was copied verbatim from the
// filing — nothing here is estimated or invented.
import { readFileSync, writeFileSync } from 'node:fs'

const FILING_URL = 'https://www.whitehouse.gov/wp-content/uploads/2025/06/Vice-President-JD-Vance.pdf'
const AS_OF = '2024-12-31' // annual report covers calendar year 2024
const FILED = '2025-06-12'

const holdings = [
  { ticker: 'QQQ', name: 'Invesco QQQ Trust, Series 1', account: 'Charles Schwab Brokerage Account #1', valueLow: 1_000_001, valueHigh: 5_000_000 },
  { ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond', account: 'Charles Schwab Brokerage Account #1', valueLow: 100_001, valueHigh: 250_000 },
  { ticker: 'DIA', name: 'SPDR Dow Jones Indus. Avg. ETF', account: 'Charles Schwab Brokerage Account #1', valueLow: 500_001, valueHigh: 1_000_000 },
  { ticker: 'SPY', name: 'SPDR S&P 500', account: 'Charles Schwab Brokerage Account #1', valueLow: 1_000_001, valueHigh: 5_000_000 },
  { ticker: 'GLD', name: 'SPDR Gold Trust', account: 'Charles Schwab Brokerage Account #1', valueLow: 250_000, valueHigh: 500_000 },
  { ticker: null, name: 'Bitcoin', account: 'Coinbase Account', valueLow: 250_001, valueHigh: 500_000 },
  { ticker: 'SPY', name: 'SPDR S&P 500', account: 'Charles Schwab SEP IRA', valueLow: 100_001, valueHigh: 250_000 },
  { ticker: 'SPY', name: 'SPDR S&P 500', account: "Spouse's Fidelity brokerage sweep account", valueLow: 15_001, valueHigh: 50_000 },
]

const realEstate = [
  { name: 'Residential real estate, Washington, DC', valueLow: 500_001, valueHigh: 1_000_000, note: 'rental income' },
  { name: 'Commercial real estate, Jackson, KY', valueLow: 50_001, valueHigh: 100_000 },
  { name: 'Residential real estate, Middletown, OH', valueLow: 50_001, valueHigh: 100_000 },
]

const disclosedTransactions = [
  { description: 'Vanguard Target Retirement 2050 Fund (VFIFX)', type: 'sell', date: '2024-08-29', amountLow: 100_001, amountHigh: 250_000 },
]

const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
const p = people.find((x) => x.id === 'jd-vance-4682')
if (!p) {
  console.error('jd-vance-4682 not found in people.json — run add-person.mjs for JD Vance first.')
  process.exit(1)
}

p.executiveDisclosure = {
  formType: 'OGE Form 278e',
  reportType: 'Annual',
  year: 2024,
  filedDate: FILED,
  asOfDate: AS_OF,
  filingUrl: FILING_URL,
  holdings,
  realEstate,
  transactions: disclosedTransactions,
}

writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
console.log(`Attached real OGE Form 278e data (${holdings.length} securities, ${realEstate.length} real estate, ${disclosedTransactions.length} transaction) to JD Vance.`)
