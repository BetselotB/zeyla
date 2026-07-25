# Notifications API — contract

Owner: Mohammed. Consumers: every page with a bell icon.

Base path `/api/notifications`. All endpoints need `x-user-id`.

**No voice.** ElevenLabs was cut, so nothing in this module speaks — it is an
in-app feed plus live socket delivery.

Every notification is pushed to the user's socket room as `notification:new`
(payload = `NotificationDto`) at the moment it is created, and stored so a user
who was offline still sees it.

| `type` | Raised when | `data` carries |
| --- | --- | --- |
| `ping_received` | a job is pinged to a provider | `requestId`, `pingId`, `urgency` |
| `ping_accepted` | a provider accepts | `requestId`, `pingId`, `providerId` |
| `ping_declined` | a provider declines | `requestId`, `pingId`, `providerId` |
| `review_received` | a customer reviews a finished job | `reviewId`, `contractId`, `rating` |
| `contract_update` | reserved for escrow | `contractId` |
| `trust_score_changed` | reserved | `providerId` |
| `system` | anything else | — |

## GET /api/notifications

Query: `limit` (1–50, default 20), `unreadOnly` (default false).

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "8c1a...",
        "userId": "2222...",
        "type": "ping_received",
        "title": "New plumber job nearby",
        "body": "0.3 km away · Bole",
        "data": { "requestId": "9f0c...", "pingId": "7d2f...", "urgency": "high" },
        "readAt": null,
        "createdAt": "2026-07-25T14:44:19.882Z"
      }
    ],
    "unreadCount": 1
  },
  "error": null
}
```

`unreadCount` is the badge number and counts the whole feed, not just the page.

## POST /api/notifications/:id/read

→ `{ "notification": NotificationDto }`. Someone else's notification is 404.
Marking an already-read one again is not an error.

## POST /api/notifications/read-all

→ `{ "markedRead": 3 }`.

## POST /api/notifications/devices

**501 `not_implemented`.** Browser push needs VAPID keys and a service worker in
`apps/web`, neither of which exists yet. Stubbed on purpose rather than
accepting device tokens that would never be delivered to. The in-app feed and
socket delivery are the working path today.

## Types

`NotificationDto`, `NotificationFeed`, `NotificationType` from `@zeyla/shared`.
