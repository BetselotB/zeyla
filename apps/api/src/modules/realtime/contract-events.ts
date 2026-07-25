import {
  CONTRACT_EVENTS_CHANNEL,
  REALTIME_EVENTS,
  type ContractEventMessage,
  type ContractStatus,
} from "@zeyla/shared";
import type { Redis } from "ioredis";
import { redis } from "../../lib/redis.js";
import { notify } from "../notifications/notifications.service.js";
import { recomputeTrustScore } from "../trust/trust.service.js";
import { contractRoom, emitToRooms, userRoom } from "./io.js";

/**
 * Escrow -> realtime/notifications bridge.
 *
 * The escrow module publishes every contract transition on a Redis channel
 * instead of importing this module, so this side subscribes rather than
 * exposing a function for it to call. Nothing here may throw: a payment has
 * already been taken by the time these events fire, and a failed notification
 * must never look like a failed transaction.
 */

let subscriber: Redis | null = null;

export function startContractEventBridge(): void {
  if (subscriber) return;

  // A connection in subscriber mode cannot run normal commands, so this cannot
  // share the client the rest of the API uses for GET/SET.
  subscriber = redis.duplicate();

  subscriber.on("error", (err: Error) => {
    console.warn("[realtime] contract event subscriber:", err.message);
  });

  subscriber.on("message", (channel: string, raw: string) => {
    if (channel !== CONTRACT_EVENTS_CHANNEL) return;
    void handleContractEvent(raw);
  });

  subscriber
    .subscribe(CONTRACT_EVENTS_CHANNEL)
    .then(() => {
      console.log(`[realtime] subscribed to ${CONTRACT_EVENTS_CHANNEL}`);
    })
    .catch((err: unknown) => {
      // Degraded, not fatal: contract status is still readable over REST.
      console.warn(
        "[realtime] could not subscribe to contract events:",
        err instanceof Error ? err.message : err,
      );
    });
}

export async function stopContractEventBridge(): Promise<void> {
  if (!subscriber) return;
  const client = subscriber;
  subscriber = null;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}

function parseEvent(raw: string): ContractEventMessage | null {
  try {
    const parsed = JSON.parse(raw) as ContractEventMessage;
    if (!parsed?.contractId || !parsed.userId || !parsed.providerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function handleContractEvent(raw: string): Promise<void> {
  const event = parseEvent(raw);
  if (!event) {
    console.warn("[realtime] ignoring malformed contract event");
    return;
  }

  // The live-tracking screen listens on the contract room; a party who has not
  // opened it yet still gets the event in their own user room.
  emitToRooms(
    [
      contractRoom(event.contractId),
      userRoom(event.userId),
      userRoom(event.providerId),
    ],
    REALTIME_EVENTS.CONTRACT_STATUS,
    event,
  );

  await Promise.all([
    announce(event),
    event.toStatus === "completed" ? onContractCompleted(event) : null,
  ]);
}

interface Announcement {
  customer: { title: string; body: string };
  provider: { title: string; body: string };
}

/** Null for transitions not worth a notification row. */
function announcementFor(
  event: ContractEventMessage,
): Announcement | null {
  const amount = `${event.amount.toLocaleString()} ${event.currency}`;

  const copy: Partial<Record<ContractStatus, Announcement>> = {
    escrowed: {
      customer: {
        title: "Payment held in escrow",
        body: `${amount} is secured. It is released to the provider only when you mark the job complete.`,
      },
      provider: {
        title: "Funds secured — you can start",
        body: `${amount} is held in escrow for this job.`,
      },
    },
    active: {
      customer: {
        title: "Job started",
        body: "Your provider is on the way. Live location is on the tracking screen.",
      },
      provider: {
        title: "Job marked active",
        body: "Your location is now shared with the customer until the job is complete.",
      },
    },
    completed: {
      customer: {
        title: "Job complete",
        body: "Payment has been released. Leave a review to help the next customer.",
      },
      provider: {
        title: "Payment released",
        body: `${amount} is on its way to you.`,
      },
    },
    disputed: {
      customer: {
        title: "Dispute opened",
        body: "The payment stays in escrow until this is resolved.",
      },
      provider: {
        title: "Dispute opened",
        body: "The payment stays in escrow until this is resolved.",
      },
    },
  };

  return copy[event.toStatus] ?? null;
}

async function announce(event: ContractEventMessage): Promise<void> {
  const copy = announcementFor(event);
  if (!copy) return;

  const data = {
    contractId: event.contractId,
    status: event.toStatus,
    amount: event.amount,
    currency: event.currency,
  };

  // notify() swallows its own failures, so one bad recipient cannot stop the other.
  await Promise.all([
    notify({
      userId: event.userId,
      type: "contract_update",
      title: copy.customer.title,
      body: copy.customer.body,
      data,
    }),
    notify({
      userId: event.providerId,
      type: "contract_update",
      title: copy.provider.title,
      body: copy.provider.body,
      data,
    }),
  ]);
}

/**
 * A completed contract feeds the trust formula, so the score is recomputed the
 * moment escrow says the job is done rather than waiting for someone to hit the
 * recompute endpoint. Recomputing is derived from stored facts and takes a row
 * lock, so a duplicate delivery (or a second API instance) is a no-op.
 */
async function onContractCompleted(event: ContractEventMessage): Promise<void> {
  try {
    const result = await recomputeTrustScore(
      event.providerId,
      `contract ${event.contractId.slice(0, 8)} completed`,
    );
    if (!result.changed) return;

    const direction = result.delta > 0 ? "up" : "down";
    const sign = result.delta > 0 ? "+" : "";
    await notify({
      userId: event.providerId,
      type: "trust_score_changed",
      title: `Trust score ${direction} to ${result.trustScore}`,
      body: `${sign}${result.delta} after completing this job.`,
      data: {
        contractId: event.contractId,
        providerId: event.providerId,
        trustScore: result.trustScore,
        delta: result.delta,
      },
    });
  } catch (err) {
    console.error("[realtime] trust recompute after completion failed", err);
  }
}
