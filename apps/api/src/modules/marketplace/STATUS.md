# Marketplace & Realtime — status for the team

Owner: Mohammed. Branch: `feat/market-provider-search`.

## Cross-check against the build list

| Item | Status | Where |
| --- | --- | --- |
| Provider search (PostGIS `ST_DWithin`, category + trust) | **Done** | `GET /api/marketplace/providers` |
| Ping flow + Socket.io to provider room | **Done** | `POST /api/marketplace/requests/:id/pings` → `ping:incoming` |
| Live location (Redis TTL, broadcast to pair) | **Done** | socket `provider:location` + `GET/POST /api/realtime/contracts/:id/location` |
| Trust score formula + recompute-on-write + log | **Done** | `apps/api/src/modules/trust/` |
| Reviews / flags endpoints | **Done** | `POST /api/trust/reviews`, `POST /api/trust/flags` |
| Whisperflow → Addis AI + explanation text | **Done** | `POST /api/marketplace/voice-requests`, `GET /api/trust/providers/:id?explain=ai` |
| Notifications (in-app, no ElevenLabs) | **Done** | `GET /api/notifications` + `notification:new` |
| Escrow Redis bridge `zeyla:contract-events` | **Done** | `realtime/contract-events.ts` → `contract:status` + trust recompute |

If `origin/main` still shows `501 not_implemented` stubs, that is because this
branch has not been merged yet — not because the work is missing.

## Contracts for Daniel

Exact request/response JSON for every endpoint:

- [`marketplace/API.md`](./API.md)
- [`../realtime/API.md`](../realtime/API.md)
- [`../trust/API.md`](../trust/API.md)
- [`../notifications/API.md`](../notifications/API.md)

Auth: `Authorization: Bearer <token>` from `/api/auth/otp/verify`.
Sockets: `io(url, { auth: { token } })`.

## Smoke

```bash
pnpm db:migrate
psql "$DATABASE_URL" -f apps/api/db/seeds/marketplace_demo.sql
ADDIS_AI_API_KEY= WHISPERFLOW_API_KEY= pnpm dev:api
pnpm --filter @zeyla/api smoke
```

Six suites, all green on a clean DB: ping, tracking, trust, notifications,
voice, contract-events.
