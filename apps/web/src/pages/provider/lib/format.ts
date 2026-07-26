import type { ServiceCategory } from "@zeyla/shared";

const CATEGORY_LABELS: Record<string, string> = {
  plumber: "Plumbing",
  electrician: "Electrical",
  carpenter: "Carpentry",
  cleaner: "Cleaning",
  painter: "Painting",
  mechanic: "Mechanic",
  mover: "Moving",
  gardener: "Gardening",
  appliance_repair: "Appliance repair",
  tutor: "Tutoring",
  other: "General",
};

export function categoryLabel(category: string | ServiceCategory): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

export function formatDistance(meters: number | null): string {
  if (meters === null) return "Distance unknown";
  if (meters < 950) return `${Math.round(meters / 10) * 10} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

export function formatRadius(meters: number): string {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * "2h 14m" / "14m" — a shift length, not a clock.
 *
 * Zero is its own case: a provider who has not worked today should not be told
 * their shift "just started".
 */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "none yet";
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return "just started";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

export function formatEtb(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} ETB`;
}

/** Seconds left on a ping, or null once it can no longer be accepted. */
export function secondsUntil(iso: string | null): number | null {
  if (!iso) return null;
  const remaining = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  return remaining > 0 ? remaining : null;
}

export function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(seconds % 60).padStart(2, "0")}`;
}
