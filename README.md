# Zeyla

Trusted local-services marketplace for a 24-hour hackathon.

**Architecture:** one modular monolith (not microservices). Core IP = **escrow state machine** + **trust score**. Fake GPS / Telebirr settlement / biometric polish if time runs short.

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
| Payments | Telebirr API |

## Repo layout

```
apps/
  api/                 Express modular monolith
    src/modules/
      auth/            Supabase JWT + Fal KYC
      marketplace/     discovery, requests, pings
      escrow/          Telebirr + contract state machine
      realtime/        Socket.io + Redis geo cache
      notifications/   ElevenLabs voice alerts
      trust/           reviews, flags, trust score
  web/                 React Vite PWA
packages/
  shared/              Shared types + trust formula
plans/
  outline.pdf          Architecture brief
docker-compose.yml     Local PostGIS + Redis
render.yaml            Render blueprint stub
```

## Prerequisites

- Node 20+
- [pnpm](https://pnpm.io/) 9+
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
4. Collect sandbox credentials for **Telebirr** and **Fal** (must-haves).
5. Optional keys ready: Whisperflow, ElevenLabs, Addis AI, Firecrawl.
6. Agree on roles (escrow, marketplace/geo, KYC, frontend/PWA, demo script).

## Suggested 24h build order

| Hours | Focus |
| --- | --- |
| 0–2 | Deploy pipeline, PostGIS/Redis, Supabase auth |
| 2–6 | Models, profile CRUD, provider list + map |
| 6–9 | Ping flow + Socket.io + contract state machine |
| 9–13 | Telebirr escrow (start sandbox early) |
| 13–16 | Fal ID/selfie KYC |
| 16–19 | Reviews, flags, trust score |
| 19–22 | Voice + NLP polish |
| 22–24 | Seed data, demo rehearsal |

## What to fake if short on time

- **Live GPS** → animate a fixed route over the socket
- **Telebirr** → sandbox + hardcoded webhook (`DEMO_MODE=true`)
- **Firecrawl** → static “verified via public profile” badge
- **Disputes** → one admin force-release button
- **KYC queue** → auto pass/fail on confidence threshold

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | API + web in parallel |
| `pnpm dev:api` / `pnpm dev:web` | One side only |
| `pnpm db:up` / `pnpm db:down` | Local PostGIS + Redis |
| `pnpm db:migrate` | Re-apply `apps/api/db/init.sql` |
| `pnpm build` | Build all packages |

## Team conventions

- Keep module boundaries under `apps/api/src/modules/*`.
- Prefer stubs + `501 not_implemented` over silent empty handlers until a flow is real.
- Never commit `.env` / secrets. Use the `.env.example` files.
- Main branch stays green; feature work on short-lived branches.
