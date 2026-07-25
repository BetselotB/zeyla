# Trust API — contract

Owner: Mohammed. Consumers: Reviews UI, Discovery UI (Daniel), escrow (Betselot).

Base path `/api/trust`. Same envelope and error conventions as the marketplace
doc. Reads of scores/reviews/flags are open; writes
(`POST /reviews`, `POST /flags`, `POST /providers/:id/recompute`) need
`Authorization: Bearer <token>`.

## The formula

```
trust_score = 50
            + min(completed_contracts * 2, 20)
            + ((avg_rating - 1) / 4) * 20        // 1★ = 0, 5★ = 20; no reviews = 0
            + (kyc_submitted   ? 10 : 0)
            + (firecrawl_match ?  5 : 0)
            - (flags_received * 5)
            , floored at 0
```

Two things worth knowing before you draw a progress bar:

- **The maximum is 105, not 100** (50 + 20 + 20 + 10 + 5). Divide by
  `TRUST_SCORE_MAX` from `@zeyla/shared`, never by 100. Raise it at standup if
  the team wants a hard 100 cap — that is a formula change, not a UI fix.
- **`kyc_submitted`** means KYC verified/in review, or pending with both ID and
  selfie uploaded. A *rejected* KYC scores nothing.

The score is always recomputed from stored facts (never incremented), so a
missed or repeated call cannot make it drift. Every change is written to
`trust_score_log` with a reason; a recompute that changes nothing writes no row.

## GET /api/trust/providers/:id

The score, its parts, and ready-to-render explanation text.

```json
{
  "success": true,
  "data": {
    "providerId": "2222...",
    "providerName": "Abebe Tadesse",
    "trustScore": 103.33,
    "breakdown": {
      "base": 50,
      "completedContracts": 20,
      "reviewBonus": 18.33,
      "kycBonus": 10,
      "firecrawlBonus": 5,
      "flagPenalty": 0,
      "total": 103.33
    },
    "stats": {
      "completedContracts": 10,
      "avgRating": 4.67,
      "reviewCount": 3,
      "flagsReceived": 0,
      "kycSubmitted": true,
      "firecrawlMatched": true
    },
    "explanation": {
      "headline": "Trust score 103.3 out of 105",
      "summary": "Abebe has completed 10 jobs through Zeyla, averages 4.7 out of 5 from 3 reviews, has submitted a government ID and matches a public business profile. No customer has flagged them. Starting from a base of 50, that works out to 103.3 out of 105.",
      "factors": [
        { "key": "base", "label": "Starting score", "points": 50, "detail": "Every verified listing starts at 50." },
        { "key": "completed_contracts", "label": "Completed jobs", "points": 20, "detail": "10 jobs finished through Zeyla (at the +20 cap)." },
        { "key": "reviews", "label": "Customer reviews", "points": 18.3, "detail": "4.7 out of 5 across 3 reviews." },
        { "key": "kyc", "label": "ID check", "points": 10, "detail": "Government ID and selfie submitted." },
        { "key": "firecrawl", "label": "Public profile", "points": 5, "detail": "Matched a public business profile." },
        { "key": "flags", "label": "Flags", "points": 0, "detail": "No complaints from customers." }
      ],
      "source": "template"
    }
  },
  "error": null
}
```

`factors` is the "why this score" panel — render it as rows, no client-side
arithmetic needed. `source` is `template` for the deterministic text and
`addis_ai` when the model rephrased it (same facts either way).

## POST /api/trust/providers/:id/recompute

Body `{ "reason": "contract completed" }` (optional, defaults to
`manual recompute`).

**Betselot:** call this when a contract flips to `completed`, so the +2 lands
immediately. No auth needed and it is safe to call twice — the score is derived
from the database, so a caller cannot push it anywhere the data does not already
justify.

```json
{
  "success": true,
  "data": {
    "providerId": "2222...",
    "previousScore": 50,
    "trustScore": 103.33,
    "delta": 53.33,
    "changed": true,
    "reason": "contract completed",
    "breakdown": { "...": "as above" },
    "inputs": { "...": "the raw counts used" }
  },
  "error": null
}
```

## GET /api/trust/providers/:id/history

`{ "entries": [{ id, delta, reason, previousScore, newScore, createdAt }] }`,
newest first — the audit trail behind the score.

## POST /api/trust/reviews  → 201

```json
{
  "contractId": "3333...",
  "rating": 5,
  "comment": "Fixed the leak in 20 minutes",
  "voiceUrl": null,
  "transcriptSource": "typed"
}
```

Only the customer on the contract, only once, and only after the contract is
`completed`. `transcriptSource` is `whisperflow` when the comment came from a
voice review, `typed` otherwise.

Response `{ "review": ReviewDto, "trust": <recompute result> }` — the review and
the new score come back together, so the UI never shows a fresh review next to a
stale score.

- 404 `contract_not_found` — unknown, or not the caller's contract.
- 409 `contract_not_completed`, 409 `review_already_exists`.

## POST /api/trust/flags  → 201

```json
{ "providerId": "2222...", "contractId": "3333...", "reason": "Quoted 500, demanded 900 on arrival" }
```

Send **either** `providerId` (customer flags a provider, −5 points) **or**
`userId` (provider flags a customer, recorded only — users have no score).
`contractId` is optional evidence.

Response `{ "flag": FlagDto, "trust": <recompute result | null> }`.

- 400 `flag_needs_exactly_one_target`, 400 `cannot_flag_yourself`.
- 409 `already_flagged` — one flag per reporter per target, so a single angry
  customer cannot drain a provider by tapping repeatedly.

## GET /api/trust/providers/:id/reviews · /flags

`{ "reviews": ReviewDto[] }` and `{ "flags": FlagDto[] }`, newest first.

## GET /api/trust/preview

The formula string plus a worked example. Useful for the demo slide.

## Types

`ProviderTrustDto`, `TrustExplanation`, `TrustFactor`, `TrustStats`,
`TrustScoreBreakdown`, `TrustLogEntryDto`, `ReviewDto`, `FlagDto`,
`TRUST_SCORE`, `TRUST_SCORE_MAX`, `computeTrustScore` — all from `@zeyla/shared`.
