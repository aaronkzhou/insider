// Real open-market buy (code P) / sell (code S) transactions, sourced from
// SEC EDGAR Form 4 filings. Same-day multi-tranche sales are aggregated into
// one row (weighted-avg price) — see scripts/fetch-sec-data.mjs.
import generated from './generated/transactions.json'

export const transactions = generated
