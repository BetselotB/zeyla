import { REALTIME_EVENTS } from "@zeyla/shared";
import { query } from "../../db/client.js";
import { emitToProvider } from "./io.js";

/**
 * Online flag drives `onlineOnly` in discovery and the ping fan-out, so it has
 * to follow the socket lifecycle rather than a "go online" button the provider
 * might forget to press.
 */
export async function setProviderPresence(providerId: string, isOnline: boolean) {
  const result = await query<{ user_id: string }>(
    `UPDATE providers
        SET is_online = $2::boolean,
            last_seen_at = now()
      WHERE user_id = $1::uuid
      RETURNING user_id`,
    [providerId, isOnline],
  );

  if (result.rowCount === 0) return false;

  emitToProvider(providerId, REALTIME_EVENTS.PRESENCE_CHANGED, {
    providerId,
    isOnline,
    at: new Date().toISOString(),
  });
  return true;
}
