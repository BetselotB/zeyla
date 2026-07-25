# Smoke suites — marketplace, realtime, trust, notifications

Owner: Mohammed. Added for the hour-9 checkpoint ("backend pair verifies the
ping + contract flow") so the whole loop can be re-checked in ten seconds after
a merge.

They drive the real HTTP API and real sockets: radius search, socket room
isolation, the Redis location TTL and the review/trust transaction are precisely
the things a mock would paper over.

## Run

```bash
pnpm db:up
pnpm db:migrate
psql "$DATABASE_URL" -f apps/api/db/seeds/marketplace_demo.sql
pnpm dev:api

pnpm --filter @zeyla/api smoke        # or: ZEYLA_PORT=4001 pnpm --filter @zeyla/api smoke
```

Point them at a scratch database, not one with data you care about — they create
requests, reviews and flags as they go.

| Suite | Covers |
| --- | --- |
| `ping-flow` | request creation, PostGIS fan-out, dedupe, provider inbox, accept/decline, who may answer |
| `tracking` | contract room membership, GPS over sockets, REST fallback, cached fix, demo route simulator |
| `trust` | the formula against hand-computed values, the audit log, reviews, flags, one-flag-per-reporter |
| `notifications` | live `notification:new`, feed, unread badge, read/read-all, ownership |
| `voice` | keyword parse (English + Amharic), full voice→request pipeline, degradation with no API keys |

The suites assume the seed's fixed UUIDs (Sara, Abebe, Hanna, contract `…390`)
and are safe to re-run: the trust suite clears the review and flags it wrote
last time before asserting, using `DATABASE_URL` (defaulting to the local dev
database). If it cannot connect it says so and carries on — the exact-score
checks will then fail on a second run, which is the honest outcome.
