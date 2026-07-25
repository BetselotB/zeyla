import type { ApiResponse } from "@zeyla/shared";
import type { Classification, Provider, ServiceRequest, TrustBreakdown } from "./types.js";
import {
  MOCK_PROVIDERS,
  mockClassify,
  mockCreateRequest,
  mockGetRequest,
  mockMatchProvider,
  mockTrustBreakdown,
} from "./mockData.js";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success || body.data == null) {
    throw new Error(body.error ?? "Request failed");
  }
  return body.data;
}

export async function classify(text: string): Promise<Classification> {
  try {
    const data = await fetchJson<{ classification: Classification }>(
      `${BASE}/marketplace/classify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );
    return data.classification;
  } catch {
    return mockClassify(text);
  }
}

export async function transcribe(
  audioBlob: Blob,
  languageCode: string,
): Promise<string> {
  try {
    const form = new FormData();
    form.append("audio", audioBlob, "voice.webm");
    form.append("language_code", languageCode);
    const data = await fetchJson<{ transcription: string }>(
      `${BASE}/marketplace/transcribe`,
      { method: "POST", body: form },
    );
    return data.transcription;
  } catch {
    return "My kitchen sink is leaking and needs urgent repair.";
  }
}

export async function createRequest(
  payload: object,
): Promise<ServiceRequest> {
  try {
    const data = await fetchJson<{ request: ServiceRequest }>(
      `${BASE}/marketplace/requests`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    return data.request;
  } catch {
    return mockCreateRequest(payload as Classification);
  }
}

export async function getRequest(id: number): Promise<ServiceRequest> {
  try {
    const data = await fetchJson<{ request: ServiceRequest }>(
      `${BASE}/marketplace/requests/${id}`,
    );
    return data.request;
  } catch {
    return mockGetRequest(id);
  }
}

export async function matchProvider(
  requestId: number,
  providerId: number,
): Promise<ServiceRequest> {
  try {
    const data = await fetchJson<{ request: ServiceRequest }>(
      `${BASE}/marketplace/requests/${requestId}/match`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId }),
      },
    );
    return data.request;
  } catch {
    return mockMatchProvider(requestId, providerId);
  }
}

export async function listProviders(
  params: Record<string, string>,
): Promise<Provider[]> {
  try {
    const qs = new URLSearchParams(params).toString();
    const data = await fetchJson<{ providers: Provider[] }>(
      `${BASE}/marketplace/providers?${qs}`,
    );
    if (data.providers.length > 0) return data.providers;
    return MOCK_PROVIDERS.filter(
      (p) => !params.category || p.category === params.category,
    );
  } catch {
    return MOCK_PROVIDERS.filter(
      (p) => !params.category || p.category === params.category,
    );
  }
}

export async function getTrustBreakdown(
  providerId: number,
): Promise<TrustBreakdown> {
  try {
    const data = await fetchJson<{ breakdown: TrustBreakdown }>(
      `${BASE}/trust/preview?providerId=${providerId}`,
    );
    return data.breakdown as TrustBreakdown;
  } catch {
    return mockTrustBreakdown(providerId);
  }
}

export async function submitRating(payload: {
  request_id: number;
  provider_id: number;
  stars: number;
  tags: string[];
  comment?: string;
}): Promise<void> {
  try {
    await fetchJson(`${BASE}/trust/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* mock success */
  }
}

export async function submitFlag(payload: {
  target_user_id: number;
  reason: string;
}): Promise<void> {
  try {
    await fetchJson(`${BASE}/trust/flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* mock success */
  }
}
