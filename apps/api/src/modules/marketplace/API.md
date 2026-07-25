# Marketplace API — contract

Owner: Mohammed. Consumers: Discovery UI, Tracking UI (Daniel).

Base path `/api/marketplace`. Every response uses the house envelope:

```json
{ "success": true, "data": { }, "error": null }
```

Errors keep the same shape with `success: false`, `data: null` (or
`{ "details": ... }` for validation failures) and a snake_case `error` string.

| Status | `error` | When |
| --- | --- | --- |
| 400 | `invalid_request` | Query/body failed validation. `data.details` lists fields. |
| 401 | `unauthenticated` | Missing/invalid caller identity. |
| 403 | `forbidden` | Caller does not own the row. |
| 404 | `provider_not_found`, `request_not_found`, `ping_not_found` | — |
| 409 | `request_not_open`, `ping_already_answered` | State machine rejection. |
| 500 | `internal_error` | Unhandled. |

## Authentication (temporary)

Supabase JWT verification is the auth module's job and is not wired yet. Until
it is, endpoints that need a caller read the header:

```
x-user-id: <uuid of the acting user>
```

Swapping to real JWTs changes one file (`lib/actor.ts`) and no request shapes,
so the UI can send this header today and forget about it later.

---

## GET /api/marketplace/providers

Radius search over PostGIS (`ST_DWithin` on a geography column), filtered by
category and trust score.

### Query parameters

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `lat` | number | **required** | -90..90 |
| `lng` | number | **required** | -180..180 |
| `radiusMeters` | int | `5000` | 100..50000 |
| `category` | string | `null` | Case-insensitive exact match on the category slug. |
| `minTrust` | number | `0` | 0..100 |
| `onlineOnly` | bool | `false` | `true`/`false`/`1`/`0` |
| `q` | string | `null` | Substring match on provider name or bio. |
| `sort` | enum | `trust` | `trust` or `distance` |
| `limit` | int | `20` | 1..50 |
| `offset` | int | `0` | Pagination. |

### Example

```
GET /api/marketplace/providers?lat=9.0301&lng=38.7578&radiusMeters=4000&category=plumber&minTrust=60&sort=distance
```

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "6b1d2a6e-6d0e-4f0a-9f1a-2c6b1f0d55aa",
        "name": "Abebe Tadesse",
        "category": "plumber",
        "bio": "15 years on burst pipes and water heaters.",
        "experienceYears": 15,
        "trustScore": 78.5,
        "isOnline": true,
        "kycStatus": "verified",
        "firecrawlVerified": false,
        "lat": 9.0312,
        "lng": 38.7601,
        "distanceMeters": 284,
        "avgRating": 4.67,
        "reviewCount": 12,
        "completedContracts": 9,
        "lastSeenAt": "2026-07-25T13:58:11.204Z"
      }
    ],
    "total": 7,
    "query": {
      "lat": 9.0301,
      "lng": 38.7578,
      "radiusMeters": 4000,
      "category": "plumber",
      "minTrust": 60,
      "onlineOnly": false,
      "q": null,
      "sort": "distance",
      "limit": 20,
      "offset": 0
    }
  },
  "error": null
}
```

Notes for the UI:

- `total` is the full match count, not the page size — use it for "7 providers
  nearby" and for paging with `offset`.
- `distanceMeters` is a whole number of metres on the WGS84 spheroid.
- `avgRating` is `null` when the provider has no reviews yet. Show "New" rather
  than a zero-star rating.
- Phone numbers are deliberately absent from discovery. Contact details are
  released only after a ping is accepted.
- `query` echoes back the parsed and defaulted parameters, so the UI can render
  active filter chips without re-deriving them.

## GET /api/marketplace/providers/:id

Same provider object plus the five most recent reviews. Optional `lat`/`lng`
query parameters produce a real `distanceMeters`; without them it is `0`.

```json
{
  "success": true,
  "data": {
    "id": "6b1d2a6e-6d0e-4f0a-9f1a-2c6b1f0d55aa",
    "name": "Abebe Tadesse",
    "trustScore": 78.5,
    "recentReviews": [
      {
        "id": "0f2c...",
        "rating": 5,
        "comment": "Fixed the leak in 20 minutes.",
        "createdAt": "2026-07-24T09:12:00.000Z"
      }
    ]
  },
  "error": null
}
```

(All `ProviderSummary` fields listed above are present; trimmed here for
brevity.)

---

## POST /api/marketplace/requests

Creates a service request. Requires `x-user-id`. → **201**

```json
{
  "category": "plumber",
  "description": "Kitchen pipe burst, water everywhere",
  "urgency": "emergency",
  "lat": 8.995,
  "lng": 38.787,
  "addressLabel": "Bole Medhanialem, behind the church",
  "radiusMeters": 3000
}
```

`description`, `addressLabel` optional. `urgency` is one of `low`, `normal`
(default), `high`, `emergency`. `radiusMeters` defaults to 5000 and is the
default fan-out radius for this request.

```json
{
  "success": true,
  "data": {
    "request": {
      "id": "9f0c...",
      "userId": "1111...",
      "category": "plumber",
      "description": "Kitchen pipe burst, water everywhere",
      "urgency": "emergency",
      "lat": 8.995,
      "lng": 38.787,
      "addressLabel": "Bole Medhanialem, behind the church",
      "radiusMeters": 3000,
      "status": "pending",
      "voiceTranscript": null,
      "nlp": null,
      "createdAt": "2026-07-25T14:31:02.881Z"
    }
  },
  "error": null
}
```

## GET /api/marketplace/requests

`{ "requests": ServiceRequestDto[] }` — the caller's own requests, newest first.

## GET /api/marketplace/requests/:id

`{ "request": ServiceRequestDto, "pings": PingDto[] }`. Someone else's request
returns 404, not 403.

## POST /api/marketplace/requests/:id/pings

Fans out to nearby providers and pushes `ping:incoming` into each provider's
socket room. Requires `x-user-id` (must own the request). → **201**

```json
{
  "providerIds": ["6b1d..."],
  "maxProviders": 5,
  "minTrust": 0,
  "radiusMeters": 3000,
  "onlineOnly": true,
  "expiresInSeconds": 300
}
```

Every field is optional. Send `providerIds` to ping an explicit shortlist the
customer tapped in the UI; omit it and the API picks the best `maxProviders`
matches — same category, inside the radius, above `minTrust`, online by default,
ordered by trust then distance.

```json
{
  "success": true,
  "data": {
    "request": { "...": "ServiceRequestDto, now status=pinged" },
    "pings": [
      {
        "id": "7d2f...",
        "requestId": "9f0c...",
        "providerId": "6b1d...",
        "status": "sent",
        "distanceMeters": 322,
        "trustScoreAtPing": 78.5,
        "sentAt": "2026-07-25T14:31:03.412Z",
        "seenAt": null,
        "respondedAt": null,
        "expiresAt": "2026-07-25T14:36:03.412Z"
      }
    ],
    "pingedProviderIds": ["6b1d..."],
    "skipped": [{ "providerId": "aaaa...", "reason": "already_pinged" }]
  },
  "error": null
}
```

Calling it twice never double-pings a provider: `pings` comes back empty and the
already-contacted ones appear in `skipped` (`already_pinged` or
`unknown_provider`). 409 `request_not_open` once the request is accepted.

## GET /api/marketplace/pings

Provider inbox. Optional `status` (`sent`/`seen`/`accepted`/`declined`) and
`limit` (default 20).

```json
{
  "success": true,
  "data": {
    "pings": [
      {
        "id": "7d2f...",
        "requestId": "9f0c...",
        "providerId": "6b1d...",
        "status": "sent",
        "distanceMeters": 322,
        "trustScoreAtPing": 78.5,
        "sentAt": "2026-07-25T14:31:03.412Z",
        "seenAt": null,
        "respondedAt": null,
        "expiresAt": "2026-07-25T14:36:03.412Z",
        "request": { "...": "ServiceRequestDto" },
        "customerName": "Sara Bekele"
      }
    ]
  },
  "error": null
}
```

## POST /api/marketplace/pings/:id/respond

```json
{ "action": "accepted" }
```

`action` is `seen`, `accepted` or `declined`. Only the pinged provider may call
it; anyone else gets 404. Accepting sets the request to `accepted` and emits
`ping:answered` to the customer.

```json
{
  "success": true,
  "data": {
    "ping": { "...": "PingDto, status=accepted" },
    "request": { "...": "ServiceRequestDto, status=accepted" }
  },
  "error": null
}
```

- 409 `ping_already_answered` — already accepted or declined.
- 409 `ping_expired` — accepting after `expiresAt`.
- 409 `request_not_open` — someone else already took the job.

**Handover to escrow:** accepting does *not* create a contract. The customer
side calls the escrow module once a provider accepts; that module owns
`contracts` and `escrow_ledger`.

## Types

TypeScript types are exported from `@zeyla/shared` — import them instead of
re-declaring: `ProviderSummary`, `ProviderDetail`, `ProviderSearchQuery`,
`ProviderSearchResult`, `ServiceRequestDto`, `PingDto`, `ProviderPingDto`,
`PingFanoutResult`, `ServiceCategory`, `Urgency`.
