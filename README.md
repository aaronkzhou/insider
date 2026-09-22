# Paper Trail

An insider-trading tracker: who's buying, who's selling, and each insider's
current portfolio — built entirely on real government filings, never mock
or invented data. Every number links back to its source document.

React + Vite + Tailwind CSS v4, dark-first UI.

## Data sources

Three separate, real disclosure systems, each with its own shape:

- **SEC EDGAR Form 4** (`scripts/fetch-sec-data.mjs`, `add-person.mjs`,
  `add-company.mjs`, `add-fund.mjs`) — corporate insiders, exact share
  counts and prices. No API key required.
- **House Clerk STOCK Act filings** (`scripts/add-congress-member.mjs`,
  `add-congress-annual-disclosure.mjs`) — members of Congress. Periodic
  Transaction Reports disclose individual trades as dollar *ranges*, never
  an exact figure or a resulting position size; the once-a-year Annual
  Financial Disclosure Report is what actually gives a real portfolio.
- **OGE Form 278e** (`scripts/add-executive-disclosure.mjs`) — executive
  branch officials (President, VP). Same range-based disclosure model as
  Congress, hand-verified against the source PDF per person.

All of it writes to `src/data/generated/*.json`. Every transaction and
holding links back to its original filing.

```bash
npm run fetch:sec
```

Re-run periodically (Form 4s must be filed within 2 business days of a
transaction, so once a day is plenty) and commit the refreshed JSON. See
`.github/workflows/refresh-sec-data.yml` for the daily automated pipeline.

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
