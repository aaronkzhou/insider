// One-off: attaches REAL Schedule 13D/13G beneficial-ownership disclosures
// for Peter Thiel, read directly from the actual SEC filings. This is a
// distinct disclosure type from Form 4 (which requires an officer/director/
// 10%-owner ROLE at one specific company and reports individual trades) and
// from a 13F (an institutional manager's quarterly holdings report). A
// Schedule 13D/13G is filed by ANY person or entity that crosses 5%
// beneficial ownership of a public company's stock, tracked here separately
// per company since each filing is its own point-in-time snapshot (not a
// continuously updated feed like Form 4).
//
// Every figure below was read directly from the cited filing on SEC EDGAR.
import { readFileSync, writeFileSync } from 'node:fs'

const positions = [
  {
    ticker: 'ABCL',
    companyName: 'AbCellera Biologics Inc.',
    sector: 'Biotechnology',
    shares: 14_360_427,
    percentOfClass: 4.99,
    asOfDate: '2023-04-24',
    filingType: 'Schedule 13D/A',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/1211060/000110465923049066/tm2313479d1_sc13da.htm',
  },
  {
    ticker: 'PGRU',
    companyName: 'PropertyGuru Group Ltd',
    sector: 'Real Estate Technology',
    shares: 10_195_197,
    percentOfClass: 6.1,
    asOfDate: '2022-09-09',
    filingType: 'Schedule 13G',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/1211060/000110465922098902/tm2225018d1_sc13g.htm',
  },
  {
    ticker: 'CMPS',
    companyName: 'COMPASS Pathways plc',
    sector: 'Biotechnology',
    shares: 1_305_788,
    percentOfClass: 3.1,
    asOfDate: '2022-02-14',
    filingType: 'Schedule 13G/A',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/1211060/000110465922022857/tm226592d3_sc13ga.htm',
  },
  {
    ticker: 'CMMB',
    companyName: 'Chemomab Therapeutics Ltd.',
    sector: 'Biotechnology',
    shares: 22_631_200,
    percentOfClass: 4.6,
    asOfDate: '2025-12-31',
    filingType: 'Schedule 13G/A',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/1211060/000121106026000005/xslSCHEDULE_13G_X01/primary_doc.xml',
  },
]

const people = JSON.parse(readFileSync('src/data/generated/people.json', 'utf8'))
const p = people.find((x) => x.id === 'thiel-peter-1060')
if (!p) {
  console.error('thiel-peter-1060 not found in people.json — run the company/person fetch first.')
  process.exit(1)
}
p.beneficialOwnership = positions

const companies = JSON.parse(readFileSync('src/data/generated/companies.json', 'utf8'))
for (const pos of positions) {
  if (!companies[pos.ticker]) {
    companies[pos.ticker] = { name: pos.companyName, sector: pos.sector, price: null, priceAsOf: null }
  }
}

writeFileSync('src/data/generated/people.json', JSON.stringify(people, null, 2) + '\n')
writeFileSync('src/data/generated/companies.json', JSON.stringify(companies, null, 2) + '\n')
console.log(`Attached ${positions.length} real Schedule 13D/13G beneficial-ownership position(s) to Peter Thiel.`)
console.log('Source: SEC EDGAR Schedule 13D/13G filings under CIK 0001211060.')
