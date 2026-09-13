# PulseWatch

## NLP-Powered Financial Market Intelligence — University NLP Course Project

PulseWatch is presented here as a Natural Language Processing course
project: a real, from-scratch NLP pipeline (classical, machine-learning,
and transformer-optional techniques) is applied to financial news and
combined with market data to explain *why* a stock's attention score
changed, not just *that* it changed. See **NLP_ARCHITECTURE.md** for the
full pipeline design, methodology classification, and architecture.

PulseWatch combines its existing price-based attention engine with a
real NLP pipeline over financial news: market data tells you **what**
happened to a stock, NLP tells you **why** it may have happened. See:

- **NLP_ARCHITECTURE.md** — full pipeline design (preprocessing, TF-IDF,
  embeddings, sentiment, NER, topics, classification, ABSA, keyphrases,
  similarity, events, summarization, clustering, attention scoring).
- **RAG_ARCHITECTURE.md** — the "Ask PulseWatch" retrieval-augmented Q&A
  layer (FAISS retrieval + grounded, anti-hallucination generation).
- **NLP_SETUP.md** — how to install and run the Python NLP service
  alongside the existing Next.js app, including optional transformer
  models (FinBERT, spaCy, sentence-transformers).
- **DATASET_SETUP.md** — where to place the Financial PhraseBank and a
  real financial news corpus.
- **DATASETS.md** — provenance, fields, and label definitions for every
  dataset actually included in this repo (all sample/demo data — see
  that file for exactly what "sample" means here).
- **MODEL_EVALUATION.md** — real, measured classical-vs-transformer
  metrics (never fabricated numbers).

New surfaces: an "NLP Intelligence" card on each tracked watchlist item,
a `/news` News Intelligence page (feed, sentiment/topic distribution,
detected events, "Ask PulseWatch" RAG interface), and a `/nlp-demo` page
for pasting arbitrary text through the full pipeline. All existing
PulseWatch functionality (watchlists, market data, the price-based
attention engine, auth) is unchanged and works with zero Python
dependency if the NLP service isn't running (`NLP_FEATURE_ENABLED=false`
or the service is simply down) — see NLP_SETUP.md.

## Market Intelligence checkpoint

The dashboard is driven by watchlist observations and the deterministic
attention engine. It does not display portfolio value, invested value, or P&L
unless a real portfolio model exists (the current product does not). The
Market snapshot reports tracked stocks, meaningful changes, gainers,
decliners, unchanged instruments, stale/unavailable data, biggest mover, and
the latest observed timestamp.

Market View is available on the dashboard with line, area, bar, candlestick,
Heikin-Ashi, Renko, and Market Map modes. Candles use provider OHLCV data;
Heikin-Ashi and Renko are pure derived views. Simulated mode clearly reports
DEMO DATA and generates deterministic OHLCV history. Twelve Data history uses
its `time_series` endpoint and returns an explicit unavailable state when the
provider, key, rate limit, or network is unavailable.

The history endpoint is `GET /api/market/history?symbol=NVDA&range=1M` and is
ownership-scoped to the current user's watchlists. The existing `/api/attention`
endpoint remains the source of truth for “Since your last visit,” freshness,
and movement classification.

## Project overview

PulseWatch is a smart market watchlist, extended for this project with
an NLP-powered financial intelligence layer (see NLP_ARCHITECTURE.md).
It aims to answer: **"What meaningfully changed since I last checked, and
what deserves my attention now?"** — rather than making the user scan
every tracked instrument manually.

**The sections below describe PulseWatch's original development history**
(watchlist CRUD, market data, the attention engine, "since your
last visit," and a UI pass), preserved as-is beneath the NLP
extension described above. I05 is a
scoped accessibility/polish pass on top of an I04 UI that already
matched most of the final brief: a keyboard focus trap and screen-
reader announcements (`aria-live`/`role="alert"`) on the confirm
dialog and loading/error states, a visible focus ring on every
interactive element, a few missing hover states, and tighter mobile
layout for the confirm dialog and dashboard stat grid. See PROGRESS.md
for exact status (including the Iteration 3→4 numbering note and the
full I05 changelist) and DECISIONS.md for why things were built this
way.

## Problem being solved

Manually scanning a watchlist for what matters doesn't scale. PulseWatch
compares the current market state against what the user last saw and
surfaces only meaningful changes, with an explainable reason for each.

## Current features

- Project scaffolding: Next.js (App Router) + TypeScript, strict mode.
- Database schema modeling users, watchlists, instruments, append-only
  price-observation history, and per-user last-seen baselines (see
  `prisma/schema.prisma`).
- `GET /api/health` — reports app liveness and database connectivity.
- Validated environment configuration (fails fast on missing/invalid
  config).
- **Watchlist CRUD** — create, rename, delete watchlists.
- **Watchlist items** — add/remove symbols on a watchlist, with duplicate
  prevention (checked in the service layer and enforced by a database
  unique constraint).
- **Market data** — a provider abstraction (`MarketDataProvider`) behind
  a factory, selected by `MARKET_DATA_PROVIDER`. Two implementations:
  - `simulated` (**default**) — a deterministic, dependency-free
    provider for local development and demos, no API key required. See
    "Simulated provider" below.
  - `twelvedata` — real quotes from Twelve Data, rate-limited and
    timeout-bound.

  Both go through the same pipeline: automatic fallback to the last
  known price (marked stale) or an explicit "unavailable" state, never a
  crash or a fabricated price, with every successful read persisted as
  history.
- **Attention engine** — a deterministic, explainable comparison of the
  current price against what the user last saw, producing one of NEW /
  UNCHANGED / CHANGED / SIGNIFICANT / STALE / UNAVAILABLE with a
  human-readable reason.
- **API**: `/api/watchlists`, `/api/attention`, and nested routes — see
  ARCHITECTURE.md for the full list. Consistent JSON error shape,
  zod-validated input.
- **UI** — a premium dark, Groww-inspired fintech "market-intelligence
  command center" look (near-black surfaces, a single Groww-inspired
  green accent, glass panels, editorial serif headings, restrained
  status colors, calm staggered motion) with PulseWatch's own layout,
  not a Groww clone. See ARCHITECTURE.md → "UI layer (Iteration 6)" and
  DECISIONS.md #24:
  - `AppHeader` — persistent glass-pill brand bar on every page, now
    showing real market-data freshness ("Updated N min ago") and a
    manual refresh control, both driven by the existing attention feed.
  - Watchlists dashboard (`/`) — an editorial page intro ("Here's what
    changed."), a 4-metric strip (watchlists, tracked stocks, meaningful
    changes, data freshness), the "since your last visit" hero panel,
    watchlist management, and a first-run empty state when there are no
    watchlists yet.
  - **"Since your last visit"** is the visual centerpiece: a glass hero
    panel with a dynamic "N meaningful changes" count, ticker + company
    name, current price, percent change, and an explicit
    `previous → current` comparison on every notable card
    (SIGNIFICANT/CHANGED/NEW), with quieter statuses collapsed by
    default.
  - Watchlist detail (`/watchlists/[id]`) — "What's moving" (the same
    attention feed, scoped to one watchlist) above "All holdings"
    (per-symbol rows showing ticker, company name, live price, percent
    change, and a freshness badge — fed by the same `/api/attention`
    data, not a second endpoint).
  - `ConfirmDialog` — an in-app confirm modal for destructive actions
    (delete watchlist, remove symbol), replacing the earlier
    `window.confirm`/`alert` calls.
  - Real loading/empty/error states throughout, no hardcoded/fake data
    in any component — see "Simulated provider" for how demo data
    actually flows.
  - Responsive down to narrow/mobile widths; entrance motion respects
    `prefers-reduced-motion`.
  - **I06 refinement**: SIGNIFICANT now colours by movement direction
    (green for a gain, red for a drop) instead of defaulting to red;
    desktop content width widened to 1120px; "Since your last visit"
    now renders ahead of the statistics strip on the dashboard; mobile
    overflow/cramping hardened. See DECISIONS.md #25/#26.
  - **First-load intro + auth polish (A08)**: a full-screen black
    typewriter splash ("PulseWatch...", ~1.7-1.8s, `prefers-reduced-motion`
    aware, runs once per real page load) via `PulseWatchIntro`, before
    the app content cross-fades in. The `/login`/`/signup` purple glow
    loops slowly around the full boundary of the screen (all four
    corners) instead of sitting static in a corner or staying confined
    to one side, and no longer fades out near the edges (a page-wide
    vignette was quietly overpainting it there). The background waves
    are dimmed but still visibly moving (a duplicate wave layer was
    removed, the remaining one was switched from a Framer Motion
    transform that silently didn't animate on an SVG `<path>` to
    native SMIL, and the purple layers were lightened to a pale violet
    so they read clearly rather than dark/muddy) so the auth form
    stays the clear focal point. See PROJECT_SPEC.md → "A08 first-load
    and auth polish" and DECISIONS.md #38-43, #45.
  - **Real-time updates (A08)**: `useAttention` (the shared hook behind
    the attention feed, header freshness readout, and watchlist rows)
    silently re-polls every 25 seconds — no loading-state flash, no
    surfaced errors on a transient failure, paused while the tab is
    hidden — so prices and "since your last visit" state stay current
    without a manual refresh. Plain `setInterval`, no WebSocket/SSE
    server, no new dependency. See DECISIONS.md #44.
  - **Gross/net portfolio P&L window (A09)**: the dashboard's Holdings
    section now leads with a "Portfolio P&L" card row — invested value,
    current value, gross P&L, an "Est. charges" deduction, and net
    P&L — that ticks live every 15 seconds on its own. Built entirely
    on the existing, clearly-labeled synthetic demo-portfolio module
    (`src/lib/demo-portfolio.ts`), never on real watchlist data — a
    watchlist has no stored quantity/purchase price, so a real P&L
    figure there isn't something this app can honestly compute yet.
    See PROJECT_SPEC.md → "A09 gross/net portfolio P&L window" and
    DECISIONS.md #46-47.
- **Anonymous per-browser identity** — a placeholder for real auth (not
  yet built) so watchlist and attention data can be scoped per user
  today. See DECISIONS.md #7.
- Test, lint, and typecheck tooling wired up (see PROGRESS.md → KNOWN
  LIMITATIONS for what could not be re-verified in this sandbox).

See PROGRESS.md → REMAINING WORK for what's next (real auth, automated
tests for the new modules, live verification).

## Technology stack

- **Frontend/Backend**: Next.js 14 (App Router), React 18, TypeScript
  (strict mode)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Validation**: zod
- **Testing**: Vitest
- **Linting**: ESLint (`next/core-web-vitals`)
- **Styling**: plain hand-written CSS (`src/app/globals.css`) — no
  framework, see DECISIONS.md

## Project structure

```
pulsewatch/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Watchlists dashboard route
│   │   ├── watchlists/[id]/page.tsx    # Watchlist detail route
│   │   ├── components/                 # Client components (UI + fetch calls)
│   │   │   ├── AppHeader.tsx
│   │   │   ├── AttentionSection.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── WatchlistsDashboard.tsx
│   │   │   └── WatchlistDetail.tsx
│   │   ├── hooks/useAttention.ts       # Shared fetch/loading/error hook for the attention feed
│   │   ├── globals.css                 # Design system (Groww-inspired fintech theme)
│   │   └── api/
│   │       ├── health/route.ts
│   │       ├── attention/route.ts
│   │       └── watchlists/             # Watchlist REST API (see ARCHITECTURE.md)
│   ├── lib/
│   │   ├── api-client.ts               # Client-safe fetch wrapper for the API
│   │   └── format.ts                   # Shared price/percent/freshness formatting
│   ├── types/                          # Shared DTOs (client + server safe)
│   │   ├── watchlist.ts
│   │   └── attention.ts
│   └── server/
│       ├── db/prisma.ts                # Prisma client singleton
│       ├── lib/
│       │   ├── env.ts                  # Validated environment config
│       │   ├── current-user.ts         # Anonymous-user placeholder for auth
│       │   └── api-response.ts         # Error → HTTP response mapping
│       └── modules/
│           ├── watchlist/              # CRUD service, validation, errors
│           ├── market/                 # Provider factory, simulated + Twelve Data providers, rate limiter, fallback
│           └── attention/              # Last-seen baselines, comparison engine
├── prisma/schema.prisma         # Database schema (+ LastSeenState)
├── tests/unit/                  # Vitest unit tests
├── .env.example
└── package.json
```

See ARCHITECTURE.md for details and rationale.

## Setup instructions

Requires Node.js 20+ and a running PostgreSQL instance.

```bash
npm install
cp .env.example .env    # then edit DATABASE_URL to point at your database
npx prisma generate
npx prisma migrate dev  # applies the schema to your database
```

## Environment variables

See `.env.example`. Required:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |
| `NEXT_PUBLIC_APP_URL` | Base URL of the app (defaults to `http://localhost:3000`) |

Optional, with defaults (market data / attention):

| Variable | Default | Description |
|---|---|---|
| `MARKET_DATA_PROVIDER` | `simulated` | `simulated` (no key needed) or `twelvedata` (real quotes) |
| `TWELVE_DATA_API_KEY` | *(unset)* | Only used when `MARKET_DATA_PROVIDER=twelvedata`. Get a free key at twelvedata.com. Without it, every quote falls back to stale/unavailable |
| `MARKET_DATA_TIMEOUT_MS` | `5000` | Provider request timeout |
| `MARKET_DATA_RATE_LIMIT_PER_MINUTE` | `7` | In-memory rate limit (Twelve Data free tier allows 8/min; not a meaningful constraint for the simulated provider) |
| `ATTENTION_CHANGED_PCT` | `0.5` | Minimum % move to classify CHANGED |
| `ATTENTION_SIGNIFICANT_PCT` | `3` | Minimum % move to classify SIGNIFICANT (must be ≥ `ATTENTION_CHANGED_PCT`) |

`src/server/lib/env.ts` validates all of these at runtime and throws a
clear error if they're missing or malformed.

## Demo flow

The default configuration (`MARKET_DATA_PROVIDER=simulated`) needs **no
external API key** — only `DATABASE_URL`:

```bash
npm install
cp .env.example .env    # DATABASE_URL only; MARKET_DATA_PROVIDER already defaults to simulated
npx prisma generate
npx prisma migrate dev
npm run dev
```

1. Open `http://localhost:3000` — first run shows the empty-state card.
2. Create a watchlist and add a few symbols (any string works, e.g.
   `AAPL`, `TCS`, `RELIANCE` — the simulated provider doesn't validate
   against a real exchange).
3. Revisit the dashboard or the watchlist page — each visit's quote
   request nudges that symbol's simulated price with a small random
   walk, occasionally a larger move, so the attention engine has real
   NEW/CHANGED/SIGNIFICANT states to show without waiting on an actual
   market.

### Simulated provider

`src/server/modules/market/providers/simulated.provider.ts` implements
the same `MarketDataProvider` interface as the real Twelve Data
provider and is selected by the same factory
(`src/server/modules/market/provider-factory.ts`) — so it goes through
the identical pipeline (rate limiter, timeout, `PriceObservation`
persistence, stale/unavailable fallback) as a real provider. No
component ever hardcodes fake prices; every price the UI shows,
simulated or real, came from `/api/attention` or `/api/watchlists/**`
by way of this same provider abstraction.

It is explicitly **development/demo only** — see the file's header
comment. To use real market data instead, set
`MARKET_DATA_PROVIDER=twelvedata` and `TWELVE_DATA_API_KEY` (see
Environment variables above).

## Database setup

1. Have a PostgreSQL instance available (locally, Docker, or hosted).
2. Set `DATABASE_URL` in `.env` accordingly.
3. Run `npx prisma generate` to generate the typed client.
4. Run `npx prisma migrate dev` to create/update the schema — this
   iteration adds the `LastSeenState` model, so a new migration is
   needed even if you already ran Iteration 1/2's migration.

To get live prices rather than "unavailable" everywhere, also set
`TWELVE_DATA_API_KEY` (see Environment variables above).

> **Note**: this sandbox's outbound network access does not include
> `npm`'s registry, Prisma's binary host, a live PostgreSQL instance, or
> Twelve Data's API, so `npm install`, `prisma generate`/`migrate dev`,
> `next build`/`lint`/`typecheck`/`test`, and a real market-data fetch
> could not be executed or verified end-to-end here — the same
> limitation noted in every iteration so far. This iteration's work was
> verified by manual code review instead. See PROGRESS.md → KNOWN
> LIMITATIONS and QA NEXT. Everything above is expected to work normally
> in any environment with standard internet access, a real database,
> and (optionally) a Twelve Data API key.

## How to run locally

```bash
npm run dev
```

Visit `http://localhost:3000` for the watchlists dashboard. Check
`http://localhost:3000/api/health` to confirm the app and database are
reachable.

## How to run tests

```bash
npm test
```

## How to build

```bash
npm run build
npm start
```

Also available: `npm run lint`, `npm run typecheck`.

## Known limitations

- **No real authentication.** Identity is a placeholder anonymous
  cookie (DECISIONS.md #7) — anyone with the cookie value can act as
  that "user." Not for production use as-is.
- **Simulated provider is demo-only.** Its prices are synthetic; see
  "Simulated provider" above. Switch to `twelvedata` for real data.
- **No automated UI/component tests.** `tests/unit/` covers `env.ts`
  config validation, the attention engine's classification/threshold/
  baseline-ordering logic, and watchlist input validation — see
  PROGRESS.md's "FINAL STATIC AUDIT" section. `AttentionSection`,
  `WatchlistsDashboard`, `WatchlistDetail`, `ConfirmDialog`, and
  `useAttention` have been manually reviewed but not exercised by an
  automated test suite, nor has the watchlist/market module's
  service-layer or database-facing logic.
- **Not verified in this sandbox**: `npm install`, `prisma
  generate`/`migrate dev`, `next build`, `npm run lint`, `npm run
  typecheck`, `npm test`, and a live Twelve Data fetch — see PROGRESS.md
  for the full QA checklist for the next pass.
