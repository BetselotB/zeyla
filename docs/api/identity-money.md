# Identity & Money API

Owner: **@betselot** — `apps/api/src/modules/auth/` and `apps/api/src/modules/escrow/`.

This is the contract the frontend builds against. TypeScript versions of every
shape live in `packages/shared/src/identity-money.ts` and are importable as
`@zeyla/shared`:

```ts
import type { Contract, AuthUser, FundContractResponse } from "@zeyla/shared";
```

Import them rather than re-declaring — if this contract changes, your build
breaks instead of your demo.

## Ground rules

- Base URL is `VITE_API_URL` (default `http://localhost:4000`), all paths below
  are prefixed with `/api`.
- Every response uses the shared envelope:
  `{ success: boolean, data: T | null, error: string | null }`.
- Authenticated requests send `Authorization: Bearer <token>`.
- Errors return the same envelope with `success: false` and a snake_case code
  in `error`. Match on the code, don't parse the string.
- Amounts are numbers in ETB. Timestamps are ISO 8601 strings.

---

## Auth

### `GET /api/auth/status`

No auth. Tells the UI which login mode is live.

```json
{ "provider": "mock", "supabaseConfigured": false, "demoMode": true,
  "otpCodesReturnedInResponse": true }
```

### `POST /api/auth/otp/request`

```jsonc
// request
{ "phone": "0911223344" }   // "+251911223344" and "911223344" also accepted
// data
{ "phone": "+251911223344", "expiresInSeconds": 300, "devCode": "049030" }
```

`devCode` appears **only** while `AUTH_OTP_PROVIDER=mock` — there is no SMS in
that mode, so the code comes back in the response. Do not build UI that depends
on it; treat it as a dev convenience (prefilling the input in dev builds is
fine).

Errors: `invalid_phone` (400).

### `POST /api/auth/otp/verify`

```jsonc
// request
{ "phone": "0911223344", "code": "049030" }
// data
{
  "token": "LHmyn37hl9elsyXmrBkti-jHsgYz0XXC_rtSNKS0UIQ",
  "expiresAt": "2026-07-28T12:14:03.815Z",
  "isNewUser": true,
  "user": {
    "id": "ab595633-baee-4d0d-bd68-080a203acd83",
    "phone": "+251911223344",
    "name": null,
    "email": null,
    "role": "user",
    "kycStatus": "pending",
    "kycSubmittedAt": null,
    "kycReviewedAt": null,
    "createdAt": "2026-07-25T12:14:03.813Z"
  }
}
```

Store `token` and send it as a bearer token from then on. `isNewUser: true`
means this phone just created an account — send them to profile setup.

Errors: `bad_code` (401), `no_code` (401), `expired` (401),
`too_many_attempts` (429), `invalid_phone` (400), `code_required` (400).

### `GET /api/auth/me` · `PATCH /api/auth/me`

Auth required. Both return an `AuthUser`. PATCH accepts
`{ "name"?: string, "email"?: string, "role"?: "user" | "provider" }`.

**Please collect `email` during onboarding.** Accounts are created from a phone
number alone, but Chapa requires a receipt email on every transaction and
validates that the domain has real MX records — so a synthesised address cannot
be used. Without one on file, checkout falls back to a server-configured
address, and if that is unset too, funding fails with
`email_required_for_checkout`. The profile form is the natural place to ask.

Errors: `missing_bearer_token` (401), `invalid_or_expired_token` (401),
`invalid_name` (400), `invalid_email` (400, includes >50 chars — Chapa's
limit), `invalid_role` (400).

### `POST /api/auth/logout`

Auth required. Revokes the token. Returns `{ "loggedOut": true }`.

### `POST /api/auth/kyc/upload`

Auth required. JSON, not multipart — send base64. A `data:` URL prefix is
accepted and preferred, since the mime type comes with it.

```jsonc
// request
{
  "idDocBase64": "data:image/jpeg;base64,/9j/4AAQ...",
  "selfieBase64": "data:image/jpeg;base64,/9j/4AAQ..."
}
// data
{
  "kycStatus": "verified",
  "idDocUrl": "/api/auth/kyc/file/<userId>/id-9c1079d8ae505c50.png",
  "selfieUrl": "/api/auth/kyc/file/<userId>/selfie-af3b13bd186f27a0.png",
  "submittedAt": "2026-07-25T12:14:04.078Z",
  "reviewedAt": "2026-07-25T12:14:04.078Z",
  "note": "Auto-verified for demo — documents stored, no biometric match performed.",
  "autoVerified": true
}
```

Accepted types: jpeg, png, webp. Max 5 MB per image (`KYC_MAX_UPLOAD_BYTES`).

> **Please read `autoVerified` before writing the success copy.** When it is
> `true` the status flipped to `verified` because `KYC_AUTO_VERIFY` is on — no
> face match ran and nothing was compared against the ID. Word it as
> "documents received" or "verified for demo", not "identity confirmed" or
> anything implying a live biometric check passed.

Errors: `id_doc_required`, `selfie_required`, `id_doc_unsupported_type`,
`selfie_unsupported_type`, `id_doc_not_base64` (400), `id_doc_too_large` (413).

### `GET /api/auth/kyc/status`

Auth required. Same shape as the upload response. Before any upload:
`kycStatus: "pending"` with null timestamps.

Possible `kycStatus` values: `pending` (nothing submitted), `manual_review`
(submitted, awaiting a decision — only when `KYC_AUTO_VERIFY=false`),
`verified`, `rejected`. Please handle all four.

### `GET /api/auth/kyc/file/:userId/:filename`

Auth required, and only the owner may read their own files. Returns the raw
image, so put the token on the request (`fetch` + object URL) rather than
dropping the path straight into `<img src>`.

Errors: `forbidden` (403), `file_not_found` (404).

---

## Escrow

### `GET /api/escrow/state-machine`

No auth. Useful for rendering a progress indicator without hardcoding it.

```json
{ "demoMode": true, "chapaConfigured": false, "platformFeePercent": 5,
  "transitions": {
    "awaiting_escrow": ["escrowed", "disputed"],
    "escrowed": ["active", "disputed"],
    "active": ["completed", "disputed"],
    "completed": [],
    "disputed": ["completed"]
  }}
```

### The `Contract` object

Returned by every contract endpoint.

```json
{
  "id": "a3a83658-0bd6-4ad3-8d94-35ed3e2fa17d",
  "requestId": null,
  "userId": "ab595633-...",
  "providerId": "e7ad0e49-...",
  "title": "Fix kitchen sink",
  "agreedAmount": 850,
  "currency": "ETB",
  "status": "escrowed",
  "createdAt": "2026-07-25T12:14:04.159Z",
  "statusUpdatedAt": "2026-07-25T12:14:04.315Z",
  "completedAt": null,
  "ledger": {
    "id": "d39e03c8-...",
    "contractId": "a3a83658-...",
    "amount": 850,
    "currency": "ETB",
    "platformFee": 42.5,
    "providerPayout": null,
    "status": "held",
    "chapaTxRef": "zeyla-a3a83658-1784981644231-02554e",
    "chapaTransferRef": null,
    "checkoutUrl": "http://localhost:4000/api/escrow/dev/checkout?...",
    "createdAt": "2026-07-25T12:14:04.231Z",
    "heldAt": "2026-07-25T12:14:04.314Z",
    "releasedAt": null,
    "refundedAt": null
  }
}
```

`ledger` is `null` until the contract has been funded once.

### `POST /api/escrow/contracts`

Auth required. The caller becomes the payer. Returns **201** and a `Contract`
with `status: "awaiting_escrow"`.

```jsonc
{ "providerId": "e7ad0e49-...", "agreedAmount": 850,
  "title": "Fix kitchen sink",       // optional
  "requestId": "…",                  // optional, marketplace service_request
  "currency": "ETB" }                // optional, defaults to ETB
```

Errors: `provider_id_required`, `agreed_amount_must_be_positive`,
`cannot_contract_with_yourself` (400), `provider_not_found` (404).

### `GET /api/escrow/contracts` · `GET /api/escrow/contracts/:id`

Auth required. The list returns contracts where the caller is either party,
newest first, capped at 100.

Errors: `contract_not_found` (404), `not_a_party_to_this_contract` (403).

### `GET /api/escrow/requests/:requestId/contract`

Auth required. "Has this job been paid for?" — keyed by **service request**
rather than contract, because the request id is what both sides already hold:
the customer arrives from discovery with it and the provider gets it on the
ping, while neither learns the contract id until checkout has started.

```jsonc
// data — before checkout
{ "contract": null, "payment": null }

// data — after Chapa's webhook confirms the money
{
  "contract": { /* the full Contract object, ledger included */ },
  "payment": {
    "contractId": "da97d49a-...",
    "requestId": "f61c46b5-...",
    "userId": "6e673ffa-...",       // the payer
    "providerId": "61ef3551-...",
    "status": "escrowed",            // ContractStatus
    "escrowStatus": "held",          // EscrowStatus, null before checkout
    "amount": 850,
    "currency": "ETB",
    "isPaid": true,                  // read this one
    "paidAt": "2026-07-25T23:50:36.444Z",
    "releasedAt": null
  }
}
```

`payment` is the flattened view both dashboards render, so the customer and the
provider cannot disagree about where the money is. **`isPaid` is the flag to
key off**: true once the ledger has left `pending`, which covers `held` *and*
`released` — a completed job that has already paid out is still "the customer
paid". It is never set by a browser redirect; only the signed webhook moves the
ledger.

Scoped to the caller in SQL. A user who is neither party gets
`{ "contract": null, "payment": null }` rather than a 403, so a stranger
guessing request ids cannot confirm a contract exists. Never 404s — no contract
yet is the normal state for a freshly accepted request, not an error.

The same summary is embedded per job on `ProviderPingDto.payment` in the
provider dashboard (`GET /api/marketplace/providers/me/dashboard`), so the
inbox can badge a job without a second call.

### `POST /api/escrow/contracts/:id/fund`

Auth required, **payer only**. Contract must be `awaiting_escrow`.

```jsonc
// request (body optional)
{ "returnUrl": "https://your-app/payment/return?contract=…",
  "email": "customer@gmail.com" }   // overrides the profile email for this payment
// data
{
  "contractId": "a3a83658-...",
  "txRef": "zeyla-a3a83658-1784981644231-02554e",
  "amount": 850,
  "currency": "ETB",
  "checkoutUrl": "https://checkout.chapa.co/checkout/payment/…",
  "simulated": false
}
```

Send the browser to `checkoutUrl`. When `simulated` is `true` there is no Chapa
key configured and the URL is a local stand-in page that behaves the same way —
build against it exactly as you would the real one.

Default return URL is `${WEB_APP_URL}/payment/return?contract=<id>`, so please
have a route there. **The return URL is not proof of payment** — the browser
comes back before or after the webhook lands, and a user can navigate there by
hand. On arrival, poll `GET /api/escrow/contracts/:id` until `status` becomes
`escrowed` (it usually already is; a second or two of "confirming payment…" is
the right UX), and treat a stuck `awaiting_escrow` as unpaid.

Errors: `only_the_payer_can_fund` (403),
`cannot_fund_contract_in_status_<status>` (409), `email_required_for_checkout`
(400 — no email on the profile and no server fallback configured; send the user
back to the profile form), `chapa_initialize_failed` (502),
`chapa_not_configured` (503).

### `POST /api/escrow/contracts/:id/start`

Auth required, either party. `escrowed` → `active`. Body: `{ "reason"?: string }`.
Returns the updated `Contract`.

### `POST /api/escrow/contracts/:id/complete`

Auth required, **payer only**. `active` → `completed`, then pays the provider
out. Body: `{ "reason"?: string }`.

```json
{ "contract": { ... }, "ledger": { ... }, "payoutError": "…optional…" }
```

Returns **200** on a clean payout. Returns **202** with `payoutError` set when
the contract completed but the transfer failed — show the job as done and the
payout as pending, not as an error. Ops resolves it with the admin retry
endpoint.

### `POST /api/escrow/contracts/:id/dispute`

Auth required, either party. Any non-terminal status → `disputed`. Body:
`{ "reason"?: string }`. Returns the updated `Contract`.

### `GET /api/escrow/contracts/:id/events`

Auth required, either party. The transition history, oldest first. Good source
for a status timeline.

```json
[{ "id": "2c8e536b-...", "contractId": "a3a83658-...",
   "fromStatus": null, "toStatus": "awaiting_escrow",
   "actor": "user:ab595633-...", "reason": "contract created",
   "createdAt": "2026-07-25T12:14:04.159Z" }]
```

`actor` is `user:<id>`, `chapa:webhook`, `admin`, or `admin:retry`.

### Transition errors

Any illegal move returns **409** `invalid_transition_<from>_to_<to>`, e.g.
`invalid_transition_awaiting_escrow_to_active`. Two requests racing the same
move gives **409** `contract_changed_concurrently`. Both mean "refetch and
re-render", not "show a red error".

---

## Not for the frontend

`POST /api/escrow/webhooks/chapa` is called by Chapa and authenticated by an
HMAC signature over the raw body. `/api/escrow/admin/*` and
`/api/auth/admin/*` need the `x-admin-key` header and exist for manual dispute
resolution — there is no admin UI planned. `/api/escrow/dev/*` only exists
while `DEMO_MODE=true`.

### Registering the webhook with Chapa

In the Chapa dashboard, under **Settings → Webhooks**:

| Field | Value |
| --- | --- |
| Webhook URL | `{PUBLIC_API_URL}/api/escrow/webhooks/chapa` |
| Secret hash | any random string — put the same value in `CHAPA_WEBHOOK_SECRET` |

`PUBLIC_API_URL` must be publicly reachable, so Chapa cannot deliver to a
laptop on localhost. Tunnel it (`ngrok http 4000`) and set `PUBLIC_API_URL` to
the tunnel origin, or point it at the deployed API. The same value is used to
build the `callback_url` sent to Chapa on initialize, so it has to be right in
both places or the webhook simply never arrives.

What the handler does, in order — a delivery that fails any step changes
nothing:

1. Verifies HMAC-SHA256 over the **raw bytes** against `CHAPA_WEBHOOK_SECRET`.
   Accepts `Chapa-Signature` (body-bound, preferred) or `x-chapa-signature`.
   A bad signature is `401`; everything else answers `200` so Chapa stops
   retrying a delivery we have deliberately ignored.
2. Records the payload hash in `chapa_webhook_events`. A repeat delivery of the
   same bytes is dropped as `duplicate_delivery`.
3. Looks up the ledger row by `tx_ref`. Unknown or already-settled refs are
   ignored.
4. **With a live key, independently re-verifies against
   `GET /transaction/verify/:tx_ref` and compares the amount.** A valid
   signature only proves the message came from Chapa; this proves the money
   arrived. A signed webhook for an unpaid transaction returns
   `chapa_reports_unpaid` and moves nothing.
5. Moves the ledger `pending → held` and the contract
   `awaiting_escrow → escrowed`, both compare-and-set, then publishes the
   transition on Redis.

That publish is what lights up both dashboards: `contract-events.ts` fans it
out as a `contract:status` socket event to the contract room and to **both
parties' user rooms**, and writes a notification for each side. Neither party
has to reload, and neither is trusted to report the payment themselves.

## Status reference

| `ContractStatus` | Means |
| --- | --- |
| `awaiting_escrow` | Created, not paid |
| `escrowed` | Chapa confirmed the hold, work can start |
| `active` | Work in progress |
| `completed` | Done, payout attempted |
| `disputed` | Either party objected; needs manual resolution |

| `EscrowStatus` | Means |
| --- | --- |
| `pending` | Checkout created, money not received |
| `held` | Zeyla is holding the funds |
| `released` | Paid out to the provider |
| `refunded` | Returned to the payer |
