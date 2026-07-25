/** In-app notification feed. Delivered over sockets and readable over REST. */

export type NotificationType =
  | "ping_received"
  | "ping_accepted"
  | "ping_declined"
  | "contract_update"
  | "review_received"
  | "trust_score_changed"
  | "system";

export interface NotificationDto {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Deep-link payload: requestId / pingId / contractId / providerId. */
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFeed {
  notifications: NotificationDto[];
  unreadCount: number;
}
