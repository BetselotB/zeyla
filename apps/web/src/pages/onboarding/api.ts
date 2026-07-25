import type {
  ApiResponse,
  AuthUser,
  KycStatusResponse,
  RequestOtpResponse,
  UpdateProfileBody,
  VerifyOtpResponse,
} from "@zeyla/shared";
import { authHeaders, setAuthToken } from "./authToken";
import { fileToBase64 } from "./fileToBase64";
import type { ProviderProfilePayload, ProviderProfileResponse } from "./types";

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? ""}${path}`;

async function callApi<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(apiUrl(path), options);
  const body = (await response.json()) as ApiResponse<T>;
  return body;
}

/** Throws with the backend's snake_case error code so callers can match on it. */
async function callApiRequired<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await callApi<T>(path, options);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "request_failed");
  }
  return response.data;
}

// See docs/api/identity-money.md — real endpoint, matches @zeyla/shared exactly.
export function requestOtp(phone: string): Promise<RequestOtpResponse> {
  return callApiRequired<RequestOtpResponse>("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
}

// See docs/api/identity-money.md. Persists the bearer token on success.
export async function verifyOtp(phone: string, code: string): Promise<VerifyOtpResponse> {
  const result = await callApiRequired<VerifyOtpResponse>("/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  setAuthToken(result.token);
  return result;
}

export function getMe(): Promise<AuthUser> {
  return callApiRequired<AuthUser>("/api/auth/me", { headers: authHeaders() });
}

export function updateProfile(body: UpdateProfileBody): Promise<AuthUser> {
  return callApiRequired<AuthUser>("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
}

// Real endpoint expects base64 JSON, not multipart — see docs/api/identity-money.md.
export async function submitKyc(idDocument: File, selfie: File): Promise<KycStatusResponse> {
  const [idDocBase64, selfieBase64] = await Promise.all([fileToBase64(idDocument), fileToBase64(selfie)]);
  return callApiRequired<KycStatusResponse>("/api/auth/kyc/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ idDocBase64, selfieBase64 }),
  });
}

export function getKycStatus(): Promise<KycStatusResponse> {
  return callApiRequired<KycStatusResponse>("/api/auth/kyc/status", { headers: authHeaders() });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// TODO(mohammed): no provider-profile HTTP route exists yet in the marketplace
// module (only the `providers` table). Role itself is real — see updateProfile
// above — but category/sub-city/bio/experience/price-range have nowhere real
// to land yet. Mocked here matching the shape we'd expect from
// POST /api/marketplace/providers until that route exists.
export async function createProviderProfile(payload: ProviderProfilePayload): Promise<ProviderProfileResponse> {
  try {
    const response = await callApi<ProviderProfileResponse>("/api/marketplace/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (response.success && response.data) return response.data;
  } catch {
    // Network error or route doesn't exist yet — fall through to mock.
  }
  console.warn("[onboarding] createProviderProfile: backend not ready, using mocked response.");
  await wait(400);
  return { providerId: `mock-provider-${Date.now()}` };
}
