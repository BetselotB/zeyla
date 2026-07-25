# Zeyla

Zeyla is a trusted local-services marketplace for Ethiopia, built as a 24-hour
hackathon project. A customer posts a service request, nearby verified providers
get pinged in real time, and the agreed fee is held in escrow through Chapa until
the job is finished — so neither side has to trust the other up front. Every
provider carries a trust score built from completed contracts, reviews, KYC
verification and flags. The escrow state machine and the trust score are the core
IP; live GPS, settlement and biometrics can be simulated if time runs short.

**Architecture:** one modular monolith (not microservices).

Architecture notes: [`plans/outline.pdf`](./plans/outline.pdf)

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React (Vite) PWA — `apps/web` |
| Backend | Node.js + Express — `apps/api` |
| DB | PostgreSQL + PostGIS |
| Cache / pub-sub | Redis |
| Realtime | Socket.io |
| Auth | Supabase Auth (phone OTP) |
| Hosting | Render (web + Postgres + Redis) |
| Payments | Chapa |
| Maps | Leaflet + OpenStreetMap |

## Repo layout

```
apps/
  api/                 Express modular monolith
    src/app.ts         Route registry — one line per module, nothing else
    src/modules/
      health/          Infra checks (shared)
      auth/            Supabase JWT + Fal KYC
      marketplace/     discovery, requests, pings
      escrow/          Chapa + contract state machine
      realtime/        Socket.io + Redis geo cache
      notifications/   ElevenLabs voice alerts
      trust/           reviews, flags, trust score
    db/migrations/     Numbered SQL migrations
  web/                 React Vite PWA
    src/App.tsx        Route registry — one line per page, nothing else
    src/pages/         One folder per feature area, one owner each
    src/components/    Shared UI (PR only)
packages/
  shared/              Shared types + trust formula (PR only)
plans/
  outline.pdf          Architecture brief
docker-compose.yml     Local PostGIS + Redis
render.yaml            Render blueprint stub
```

## Folder ownership

Enforced by [`.github/CODEOWNERS`](./.github/CODEOWNERS). Stay inside your folders.
To change someone else's folder, open a PR and let the owner merge it.

| Area | Path | Owner |
| --- | --- | --- |
| Auth + KYC | `apps/api/src/modules/auth/` | Betselot |
| Escrow | `apps/api/src/modules/escrow/` | Betselot |
| Marketplace | `apps/api/src/modules/marketplace/` | Mohammed |
| Realtime | `apps/api/src/modules/realtime/` | Mohammed |
| Notifications | `apps/api/src/modules/notifications/` | Mohammed |
| Trust / reviews API | `apps/api/src/modules/trust/` | Mohammed |
| Onboarding UI | `apps/web/src/pages/onboarding/` | Maramawit |
| Payment UI | `apps/web/src/pages/payment/` | Maramawit |
| Discovery UI | `apps/web/src/pages/discovery/` | Daniel |
| Tracking UI | `apps/web/src/pages/tracking/` | Daniel |
| Reviews UI | `apps/web/src/pages/reviews/` | Daniel |
| Shared components | `apps/web/src/components/` | Eyoel — PR only for everyone else |
| Shared types | `packages/shared/` | Betselot + Mohammed — PR only |

Two files are touched by everyone, so they are deliberately kept trivial:

- `apps/api/src/app.ts` — only `router.use('/x', xRouter)` lines
- `apps/web/src/App.tsx` — only `<Route>` lines

Add or remove exactly one line for your own module. A one-line change never
produces a real merge conflict.

## Working agreements

- **Branch naming:** `feat/<module>-<short-description>`
  e.g. `feat/escrow-chapa-webhook`, `feat/discovery-map-view`
- **Commit messages:** `[module] short description`
  e.g. `[escrow] add webhook signature verification`
- **Branches are short-lived.** Merge within a couple of hours, not at end of day.
- **Push at least every 30–45 minutes**, even mid-feature. Small, frequent pushes
  keep conflicts small. A branch that lives all day is a merge disaster at hour 20.
- **Before creating a migration, `git pull` first**, so two people never generate
  the same number in `apps/api/db/migrations/`.
- **API contract:** every endpoint returns
  `{ success: boolean, data: object | null, error: string | null }`.
  Full conventions in [`.cursorrules`](./.cursorrules).

## Team checkpoints

Three moments where everyone stops and syncs. Hours line up with the phase
boundaries in the build order below.

| Hour | Checkpoint |
| --- | --- |
| 2 | **API contracts agreed.** Both backend devs and both frontend devs sign off on request/response shapes for every endpoint before anyone builds UI against them. |
| 9 | **Pairs merge and smoke-test independently.** Backend pair merges to main and verifies the ping + contract flow; frontend pair merges and verifies their pages against it. Each side proves its half works before the halves are joined. |
| 16 | **Full end-to-end run as a team.** Whole flow on one machine: sign up, discover, ping, escrow, track, complete, review. Anything broken here is triaged as fix-or-fake immediately. |

## Prerequisites

- Node 20+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable` is enough)
- Docker (for local Postgres/PostGIS + Redis)

## Get started

```bash
git clone git@github.com:<ORG_OR_USER>/zeyla.git
cd zeyla
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:up          # PostGIS + Redis
pnpm dev            # API :4000 + web :5173
```

> If the GitHub remote is not live yet, clone from whoever owns this folder, or ask a teammate to run `gh repo create zeyla --public --source=. --remote=origin --push`.

Health check: [http://localhost:4000/api/health](http://localhost:4000/api/health)

## Pre-hackathon checklist (do this before day-of)

1. Clone repo, confirm `pnpm install` + `pnpm db:up` + `pnpm dev` works.
2. Create a **Supabase** project; enable phone auth; paste keys into both `.env` files.
3. Create a **Render** account / team; note credits for web + Postgres + Redis.
4. Collect sandbox credentials for **Chapa** and **Fal** (must-haves).
5. Optional keys ready: Whisperflow, ElevenLabs, Addis AI, Firecrawl.
6. Confirm folder ownership above; everyone reads `.cursorrules`.

## Suggested 24h build order

| Hours | Focus |
| --- | --- |
| 0–2 | Deploy pipeline, PostGIS/Redis, Supabase auth |
| 2–6 | Models, profile CRUD, provider list + map |
| 6–9 | Ping flow + Socket.io + contract state machine |
| 9–13 | Chapa escrow (start sandbox early) |
| 13–16 | Fal ID/selfie KYC |
| 16–19 | Reviews, flags, trust score |
| 19–22 | Voice + NLP polish |
| 22–24 | Seed data, demo rehearsal |

## What to fake if short on time

- **Live GPS** → animate a fixed route over the socket
- **Chapa** → sandbox + hardcoded webhook (`DEMO_MODE=true`)
- **Firecrawl** → static "verified via public profile" badge
- **Disputes** → one admin force-release button
- **KYC queue** → auto pass/fail on confidence threshold

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | API + web in parallel |
| `pnpm dev:api` / `pnpm dev:web` | One side only |
| `pnpm db:up` / `pnpm db:down` | Local PostGIS + Redis |
| `pnpm db:migrate` | Apply every file in `apps/api/db/migrations/` in order |
| `pnpm build` | Build all packages |
