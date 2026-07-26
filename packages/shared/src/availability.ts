/**
 * Provider availability — the "am I on the radar right now" switch.
 *
 * Availability is an *intent* the provider sets and that survives a reload, not
 * a side effect of having the app open. `providers.is_online`, which discovery
 * and the ping fan-out filter on, is derived from it in the database, so there
 * is exactly one way to become discoverable.
 */

import type { ProviderPingDto, ProviderProfile } from "./marketplace.js";

export const AVAILABILITY_STATUSES = ["offline", "online", "busy"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/**
 * Why the status last changed. `job_accepted` / `job_finished` are set by the
 * server, so the UI can tell an automatic switch from one the provider made.
 */
export const AVAILABILITY_SOURCES = [
  "provider",
  "job_accepted",
  "job_finished",
  "system",
] as const;
export type AvailabilitySource = (typeof AVAILABILITY_SOURCES)[number];

export interface ProviderAvailability {
  providerId: string;
  status: AvailabilityStatus;
  /** What discovery and the fan-out actually filter on. True only when online. */
  isDiscoverable: boolean;
  source: AvailabilitySource;
  serviceRadiusMeters: number;
  /** Base point the radius is measured from. Null until a location is known. */
  lat: number | null;
  lng: number | null;
  /** Start of the current online stretch; null while offline. */
  wentOnlineAt: string | null;
  /** Last heartbeat or socket frame. Stale means the app is probably closed. */
  lastSeenAt: string | null;
  /** Includes the stretch in progress, so a live counter can tick off it. */
  onlineSecondsToday: number;
}

export interface SetAvailabilityInput {
  status: AvailabilityStatus;
  /** Current position. Sent when going online so the radius follows the van. */
  lat?: number;
  lng?: number;
  serviceRadiusMeters?: number;
}

export interface HeartbeatInput {
  lat?: number;
  lng?: number;
}

/** Today's shift, as the provider home screen shows it. */
export interface ProviderShiftStats {
  pingsReceivedToday: number;
  /** Unanswered and not yet expired — the number on the inbox badge. */
  pendingPings: number;
  acceptedToday: number;
  declinedToday: number;
  completedToday: number;
  /** Escrow released to this provider today. */
  earnedTodayEtb: number;
  /** Held in escrow on jobs that are not finished yet. */
  pendingEarningsEtb: number;
  /** Every payout this provider has ever received, net of the platform fee. */
  earnedTotalEtb: number;
  /** Contracts completed over the provider's whole history, not just today. */
  completedTotal: number;
  /** Mean review rating across every job. Null before the first review. */
  avgRating: number | null;
  reviewCount: number;
  /** Accepted / answered over the last 30 days. Null before the first answer. */
  acceptanceRate: number | null;
  onlineSecondsToday: number;
}

/**
 * What the provider is missing (or competing for) right now: open requests in
 * their trade and radius, and how many other providers are online to take them.
 */
export interface DemandSnapshot {
  openRequests: number;
  competingProviders: number;
  radiusMeters: number;
}

export interface ProviderDashboard {
  provider: ProviderProfile;
  availability: ProviderAvailability;
  stats: ProviderShiftStats;
  demand: DemandSnapshot;
  /** Live and recently answered pings, newest first. */
  inbox: ProviderPingDto[];
}

/**
 * Customer-side mirror: how much of the market is reachable from this point
 * right now. Drives the "3 electricians online nearby" line on the intake
 * screen, and the warning shown when the answer is zero.
 */
export interface NearbyAvailability {
  category: string | null;
  radiusMeters: number;
  online: number;
  total: number;
  /** Distance to the closest online provider. Null when nobody is online. */
  nearestOnlineMeters: number | null;
  /** Median trust of the online set, so "available" is not confused with "good". */
  medianTrustScore: number | null;
}
