import { query } from "../../db/client.js";
import {
  heartbeat,
  setAvailability,
} from "../marketplace/availability.service.js";

/**
 * Socket-side view of provider presence.
 *
 * Connecting no longer puts anyone on the radar. Discoverability is the
 * `availability_status` the provider set (see marketplace/availability.service)
 * and it outlives the socket, so closing a tab does not silently end a shift
 * and re-opening one does not silently start it. All a connection proves is
 * that the app is running, which is a heartbeat.
 */

/** Refreshes `last_seen_at` for a provider who just connected or disconnected. */
export async function touchProviderPresence(providerId: string): Promise<void> {
  try {
    await heartbeat(providerId, {});
  } catch {
    // Not every authenticated socket belongs to a provider profile.
  }
}

/**
 * The `provider:presence` socket event — an explicit toggle sent over the
 * socket instead of the REST endpoint. Routed through the same service so it
 * writes the log row and reaches the provider's other tabs.
 */
export async function setProviderPresence(
  providerId: string,
  isOnline: boolean,
): Promise<boolean> {
  const exists = await query<{ user_id: string }>(
    "SELECT user_id FROM providers WHERE user_id = $1::uuid",
    [providerId],
  );
  if (exists.rowCount === 0) return false;

  await setAvailability(
    providerId,
    { status: isOnline ? "online" : "offline" },
    "provider",
  );
  return true;
}
