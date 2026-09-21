// Real reporting insiders, sourced from SEC EDGAR Form 4 filings.
import generated from './generated/people.json'

export const people = generated

export function getPerson(id) {
  return people.find((p) => p.id === id)
}
