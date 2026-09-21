// Real companies, sourced from SEC EDGAR. `price` is the most recently
// reported price from an actual insider Form 4 transaction on that ticker
// (see `priceAsOf`) — not a live market quote, since we don't have a quotes API wired up.
import generated from './generated/companies.json'

export const companies = generated
