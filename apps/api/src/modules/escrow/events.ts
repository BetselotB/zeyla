import {
  CONTRACT_EVENTS_CHANNEL,
  type Contract,
  type ContractEventMessage,
  type ContractStatus,
} from "@zeyla/shared";
import { redis } from "../../lib/redis.js";

/**
 * Contract transitions are announced on a Redis channel instead of by calling
 * the realtime or notifications modules directly. That keeps escrow free of
 * imports from another owner's folder, and lets them subscribe on their own
 * schedule:
 *
 *   subscriber.subscribe(CONTRACT_EVENTS_CHANNEL)
 *   subscriber.on("message", (_, raw) => io.to(room).emit(...))
 *
 * Publishing is best-effort: a dead Redis must never roll back a payment.
 */
export async function publishContractEvent(
  contract: Contract,
  fromStatus: ContractStatus | null,
): Promise<void> {
  const message: ContractEventMessage = {
    contractId: contract.id,
    userId: contract.userId,
    providerId: contract.providerId,
    fromStatus,
    toStatus: contract.status,
    amount: contract.agreedAmount,
    currency: contract.currency,
    at: new Date().toISOString(),
  };

  try {
    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect();
    }
    await redis.publish(CONTRACT_EVENTS_CHANNEL, JSON.stringify(message));
  } catch (err) {
    console.warn(
      `[escrow] could not publish ${contract.id} ${fromStatus} -> ${contract.status}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
