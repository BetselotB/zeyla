# Realtime API — contract

Owner: Mohammed. Consumers: Tracking UI, Discovery UI (Daniel).

Socket.io on the same origin as the API. REST base path `/api/realtime`.

## Connecting

```ts
import { io } from "socket.io-client";
import { REALTIME_EVENTS } from "@zeyla/shared";

const socket = io(import.meta.env.VITE_API_URL, {
  auth: { userId, role: "user" }, // role: "provider" for the provider app
});
```

The handshake is rejected with `unauthenticated` if `userId` is missing or not
a UUID. Rooms are joined **server-side** from that identity — a client cannot
ask to join `user:<someone else>`.

| Room | Who is in it | What arrives |
| --- | --- | --- |
| `user:{userId}` | every socket of that user | `ping:answered`, `notification:new` |
| `provider:{providerId}` | sockets connected with `role: "provider"` | `ping:incoming`, `presence:changed` |
| `contract:{contractId}` | the customer + provider on that job | `contract:location` |

Connecting with `role: "provider"` marks the provider online; disconnecting the
last socket marks them offline. That flag is what `onlineOnly` filters on in
discovery and in the ping fan-out, so the provider app should stay connected
while the provider is available.

## Client -> server

| Event | Payload | Notes |
| --- | --- | --- |
| `join:contract` | `{ contractId }` | Checked against the contract parties. Non-parties get `realtime:error`. |
| `leave:contract` | `{ contractId }` | — |
| `provider:location` | `{ contractId, lat, lng, headingDegrees?, speedMps?, accuracyMeters? }` | Provider only, every 5–10s while the contract is live. |
| `provider:presence` | `{ isOnline }` | Manual "go offline" toggle without disconnecting. |

## Server -> client

| Event | Payload |
| --- | --- |
| `ping:incoming` | `ProviderPingDto` — the ping plus the full request and customer name |
| `ping:answered` | `{ pingId, requestId, providerId, providerName, status, answeredAt }` |
| `contract:location` | `LiveLocation` |
| `presence:changed` | `{ providerId, isOnline, at }` |
| `notification:new` | `NotificationDto` |
| `realtime:error` | `{ event, message }` — a rejected frame, never a disconnect |

```ts
// LiveLocation
{
  "contractId": "3333...",
  "providerId": "2222...",
  "lat": 8.9975,
  "lng": 38.7885,
  "headingDegrees": 210,
  "speedMps": 6.5,
  "accuracyMeters": 9,
  "recordedAt": "2026-07-25T14:52:10.114Z"
}
```

Bad frames answer with `realtime:error` and are dropped; the socket stays open,
because killing it would blank the customer's map.

---

## REST mirrors

For clients that cannot hold a socket open, and for the demo. All of these need
`x-user-id` (see the marketplace API doc for why).

### GET /api/realtime/status

Transport, event catalogue, `locationTtlSeconds` and `demoMode`. Handy as a
liveness probe for the realtime layer.

### POST /api/realtime/contracts/:id/location

Same payload as the `provider:location` event, minus `contractId` (it is in the
path). Provider on that contract only.

```json
{ "lat": 8.9975, "lng": 38.7885, "headingDegrees": 210, "speedMps": 6.5, "accuracyMeters": 9 }
```

→ `{ "location": LiveLocation }`, and every socket in the contract room gets
`contract:location`.

- 403 `only_the_provider_can_post_location` — the customer tried to post.
- 404 `contract_not_found` — unknown contract *or* caller is not a party.
- 409 `contract_not_trackable` — contract is not `escrowed`/`active`.

### GET /api/realtime/contracts/:id/location

Last known fix. Either party may read it.

```json
{
  "success": true,
  "data": {
    "location": { "...": "LiveLocation", "ageSeconds": 4 },
    "watchers": 1,
    "simulated": false
  },
  "error": null
}
```

Fixes live in Redis under `geo:contract:{id}` with a **30 second TTL**, so a
stale position can never be served as live: after ~30s of silence this returns
404 `location_not_found`. Poll it every few seconds if you cannot use sockets,
and treat `ageSeconds > 15` as "signal lost" in the UI.

### POST /api/realtime/contracts/:id/simulate  (DEMO_MODE only)

Animates the provider along a straight line to the job over the normal socket
path — the fallback for live GPS in the build plan. Either party may start it.

```json
{ "steps": 20, "intervalMs": 2000 }
```

→ `{ contractId, providerId, from, to, steps, intervalMs }`.
`DELETE` the same path to stop it early. 403 `demo_mode_disabled` when
`DEMO_MODE=false`.

## Types

`LiveLocation`, `CachedLocation`, `PingAnsweredEvent`, `PresenceChangedEvent`,
`RealtimeErrorEvent` and the `REALTIME_EVENTS` name map are exported from
`@zeyla/shared`. Use `REALTIME_EVENTS` rather than typing event strings.
