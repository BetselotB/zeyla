import type {
  ApiResponse,
  NearbyAvailability,
  ProviderAvailability,
  ProviderDashboard,
  ProviderPingDto,
  ServiceRequestDto,
  SetAvailabilityInput,
} from "@zeyla/shared";
import { API_BASE, authHeaders } from "../../../auth/session";

/**
 * Provider home API client.
 *
 * Errors propagate with the server's own error code, because this screen has to
 * distinguish them: `provider_profile` not found means "you are a customer",
 * which is a redirect rather than a red banner.
 */

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query } = options;

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = await authHeaders();
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const envelope = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!envelope?.success || envelope.data == null) {
    throw new Error(envelope?.error ?? `request_failed_${res.status}`);
  }
  return envelope.data;
}

export function getDashboard(): Promise<ProviderDashboard> {
  return call<ProviderDashboard>("/marketplace/providers/me/dashboard");
}

export async function setAvailability(
  input: SetAvailabilityInput,
): Promise<ProviderAvailability> {
  const data = await call<{ availability: ProviderAvailability }>(
    "/marketplace/providers/me/availability",
    { method: "PUT", body: input },
  );
  return data.availability;
}

/** Keep-alive while online. Cannot change status — that is the toggle's job. */
export async function sendHeartbeat(
  position?: { lat: number; lng: number },
): Promise<ProviderAvailability> {
  const data = await call<{ availability: ProviderAvailability }>(
    "/marketplace/providers/me/heartbeat",
    { method: "POST", body: position ?? {} },
  );
  return data.availability;
}

export async function listInbox(): Promise<ProviderPingDto[]> {
  const data = await call<{ pings: ProviderPingDto[] }>("/marketplace/pings", {
    query: { limit: 20 },
  });
  return data.pings;
}

export function respondToPing(
  pingId: string,
  action: "seen" | "accepted" | "declined",
): Promise<{ ping: ProviderPingDto; request: ServiceRequestDto }> {
  return call(`/marketplace/pings/${pingId}/respond`, {
    method: "POST",
    body: { action },
  });
}

export function cancelJob(
  requestId: string,
): Promise<{ request: ServiceRequestDto }> {
  return call(`/marketplace/requests/${encodeURIComponent(requestId)}/cancel`, {
    method: "POST",
  });
}

/** Customer-facing: how many providers near a point are online right now. */
export function getNearbyAvailability(params: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  category?: string;
}): Promise<NearbyAvailability> {
  return call<NearbyAvailability>("/marketplace/availability/nearby", {
    query: params,
  });
}
