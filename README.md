# Insider Desk

An insider-trading tracker: who's buying, who's selling, and each insider's
current portfolio — built on real SEC EDGAR Form 4 filings, not mock data.

React + Vite + Tailwind CSS v4, dark-first UI.

## Data

`scripts/fetch-sec-data.mjs` pulls real Form 4 filings straight from SEC
EDGAR's public API (no key required) for a set of large-cap tickers, keeps
only open-market purchase (code `P`) and sale (code `S`) transactions, and
writes the result to `src/data/generated/*.json`. Every transaction links
back to its original SEC filing.

```bash
npm run fetch:sec
```

Re-run it periodically (Form 4s must be filed within 2 business days of a
transaction, so once a day is plenty) and commit the refreshed JSON.

## Develop

```bash
npm install
npm run fetch:sec   # populates src/data/generated/*.json
npm run dev
```

## Build

```bash
npm run build
```

## Deploy

Static Vite build — deploys as-is on Vercel. `vercel.json` adds the SPA
rewrite so client-side routes (e.g. `/people/:id`) don't 404 on direct load.
