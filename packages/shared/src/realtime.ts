/**
 * Socket.io contract between the API (apps/api/src/modules/realtime) and the
 * tracking / discovery pages.
 *
 * Handshake: io(API_URL, { auth: { token } }) — the same bearer token the REST
 * endpoints take. The server derives the user and their role from it; a user
 * whose role is "provider" also joins the provider room, which is where pings
 * land.
 */

import type { AvailabilitySource, AvailabilityStatus } from "./availability.js";
import type { ContractEventMessage } from "./identity-money.js";
import type { ProviderPingDto } from "./marketplace.js";

export const REALTIME_EVENTS = {
  // client -> server
  JOIN_CONTRACT: "join:contract",
  LEAVE_CONTRACT: "leave:contract",
  PROVIDER_LOCATION: "provider:location",
  PROVIDER_PRESENCE: "provider:presence",
  // server -> client
  PING_INCOMING: "ping:incoming",
  PING_ANSWERED: "ping:answered",
  CONTRACT_LOCATION: "contract:location",
  CONTRACT_STATUS: "contract:status",
  PRESENCE_CHANGED: "presence:changed",
  NOTIFICATION_NEW: "notification:new",
  REALTIME_ERROR: "realtime:error",
} as const;

export interface SocketAuth {
  /** Supabase access token or mock-OTP session token, same as `Authorization`. */
  token: string;
}

/** One GPS sample from a provider during an active contract. */
export interface LiveLocation {
  contractId: string;
  providerId: string;
  lat: number;
  lng: number;
  headingDegrees: number | null;
  speedMps: number | null;
  accuracyMeters: number | null;
  recordedAt: string;
}

/** What the REST fallback returns; `ageSeconds` shows how stale the fix is. */
export interface CachedLocation extends LiveLocation {
  ageSeconds: number;
}

export interface PingAnsweredEvent {
  pingId: string;
  requestId: string;
  providerId: string;
  providerName: string | null;
  status: "seen" | "accepted" | "declined";
  answeredAt: string;
}

export interface PresenceChangedEvent {
  providerId: string;
  /** Convenience mirror of `status === "online"`. */
  isOnline: boolean;
  status: AvailabilityStatus;
  source: AvailabilitySource;
  at: string;
}

export interface RealtimeErrorEvent {
  event: string;
  message: string;
}

/** Payloads the client is allowed to send. */
export interface ClientToServerEvents {
  [REALTIME_EVENTS.JOIN_CONTRACT]: (payload: { contractId: string }) => void;
  [REALTIME_EVENTS.LEAVE_CONTRACT]: (payload: { contractId: string }) => void;
  [REALTIME_EVENTS.PROVIDER_LOCATION]: (payload: {
    contractId: string;
    lat: number;
    lng: number;
    headingDegrees?: number;
    speedMps?: number;
    accuracyMeters?: number;
  }) => void;
  [REALTIME_EVENTS.PROVIDER_PRESENCE]: (payload: { isOnline: boolean }) => void;
}

export interface ServerToClientEvents {
  [REALTIME_EVENTS.PING_INCOMING]: (payload: ProviderPingDto) => void;
  [REALTIME_EVENTS.PING_ANSWERED]: (payload: PingAnsweredEvent) => void;
  [REALTIME_EVENTS.CONTRACT_LOCATION]: (payload: LiveLocation) => void;
  /** Mirrors an escrow state-machine transition onto the live map screen. */
  [REALTIME_EVENTS.CONTRACT_STATUS]: (payload: ContractEventMessage) => void;
  [REALTIME_EVENTS.PRESENCE_CHANGED]: (payload: PresenceChangedEvent) => void;
  [REALTIME_EVENTS.NOTIFICATION_NEW]: (payload: unknown) => void;
  [REALTIME_EVENTS.REALTIME_ERROR]: (payload: RealtimeErrorEvent) => void;
}
