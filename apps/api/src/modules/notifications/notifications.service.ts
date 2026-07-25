import type {
  NotificationDto,
  NotificationFeed,
  NotificationType,
} from "@zeyla/shared";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { query } from "../../db/client.js";
import type { Actor } from "../marketplace/lib/actor.js";
import { ApiError } from "../marketplace/lib/errors.js";
import { emitToUser } from "../realtime/io.js";

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
}

const COLUMNS = "id, user_id, type, title, body, data, read_at, created_at";

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}

/**
 * Record a notification and push it to the user's sockets.
 *
 * Never throws at the caller: a notification is a side effect of the ping or
 * review that triggered it, and a failed insert must not roll back the thing
 * that actually matters.
 */
export async function notify(input: NotifyInput): Promise<NotificationDto | null> {
  try {
    const result = await query<NotificationRow>(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
       RETURNING ${COLUMNS}`,
      [
        input.userId,
        input.type,
        input.title,
        input.body ?? null,
        JSON.stringify(input.data ?? {}),
      ],
    );

    const notification = toDto(result.rows[0]!);
    emitToUser(input.userId, REALTIME_EVENTS.NOTIFICATION_NEW, notification);
    return notification;
  } catch (err) {
    console.error("[notifications] failed to record notification", err);
    return null;
  }
}

/** Same, for a batch of recipients (a ping fan-out). */
export async function notifyMany(inputs: NotifyInput[]) {
  return Promise.all(inputs.map(notify));
}

export async function listNotifications(
  actor: Actor,
  options: { limit: number; unreadOnly: boolean },
): Promise<NotificationFeed> {
  const result = await query<NotificationRow & { unread_count: string }>(
    `SELECT ${COLUMNS},
            (SELECT COUNT(*) FROM notifications
              WHERE user_id = $1::uuid AND read_at IS NULL) AS unread_count
       FROM notifications
      WHERE user_id = $1::uuid
        AND ($3::boolean = false OR read_at IS NULL)
      ORDER BY created_at DESC
      LIMIT $2::int`,
    [actor.userId, options.limit, options.unreadOnly],
  );

  // The window is empty when there are no rows, so fall back to a direct count.
  const unreadCount = result.rows[0]
    ? Number(result.rows[0].unread_count)
    : await countUnread(actor.userId);

  return { notifications: result.rows.map(toDto), unreadCount };
}

async function countUnread(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1::uuid AND read_at IS NULL",
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function markRead(actor: Actor, notificationId: string) {
  const result = await query<NotificationRow>(
    `UPDATE notifications
        SET read_at = COALESCE(read_at, now())
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING ${COLUMNS}`,
    [notificationId, actor.userId],
  );
  const row = result.rows[0];
  if (!row) throw ApiError.notFound("notification");
  return toDto(row);
}

export async function markAllRead(actor: Actor) {
  const result = await query(
    `UPDATE notifications SET read_at = now()
      WHERE user_id = $1::uuid AND read_at IS NULL`,
    [actor.userId],
  );
  return { markedRead: result.rowCount ?? 0 };
}
