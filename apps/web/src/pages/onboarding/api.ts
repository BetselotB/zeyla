import type {
  ApiResponse,
  KycStatus,
  KycStatusResponse,
  KycSubmitResponse,
  OtpRequestResponse,
  OtpVerifyResponse,
  ProviderProfilePayload,
  ProviderProfileResponse,
} from "./types";

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? ""}${path}`;

async function callApi<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(apiUrl(path), options);
  return response.json() as Promise<ApiResponse<T>>;
}

/**
 * Tries Betselot's real endpoint first. If it isn't wired yet (network error,
 * or the `{ success: false, error: "not_implemented" }` stub shape), falls
 * back to a mock that matches the same contract so the screen never blocks
 * on backend availability.
 */
async function callApiOrMock<T>(
  path: string,
  options: RequestInit | undefined,
  mock: () => Promise<T>,
  mockLabel: string,
): Promise<T> {
  try {
    const response = await callApi<T>(path, options);
    if (response.success && response.data) return response.data;
    if (response.error && response.error !== "not_implemented") {
      throw new Error(response.error);
    }
  } catch {
    // Network error (endpoint doesn't exist yet, API not running, etc.) — fall through to mock.
  }
  console.warn(`[onboarding] ${mockLabel}: backend not ready, using mocked response.`);
  return mock();
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// TODO(betselot): swap for real POST /api/auth/otp/request once the OTP-over-backend
// contract is live. Expected request body: { phone: "+2519XXXXXXXX" }.
export function requestOtp(phone: string): Promise<OtpRequestResponse> {
  return callApiOrMock<OtpRequestResponse>(
    "/api/auth/otp/request",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    },
    async () => {
      await wait(400);
      return { requestId: `mock-${Date.now()}`, expiresInSeconds: 300 };
    },
    "requestOtp",
  );
}

// TODO(betselot): swap for real POST /api/auth/otp/verify. Expected request body:
// { phone, requestId, code }. Expected success data: { accessToken, userId, role }.
export function verifyOtp(phone: string, requestId: string, code: string): Promise<OtpVerifyResponse> {
  return callApiOrMock<OtpVerifyResponse>(
    "/api/auth/otp/verify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, requestId, code }),
    },
    async () => {
      await wait(400);
      if (code.length !== 6) throw new Error("That code should be 6 digits.");
      return { accessToken: `mock-token-${Date.now()}`, userId: `mock-user-${phone}`, role: null };
    },
    "verifyOtp",
  );
}

// TODO(betselot): swap for real POST /api/auth/kyc/verify once Fal OCR + face-match
// (or the demo auto-verify path) is wired. Currently posts multipart form data with
// `idDocument` and `selfie` files.
export function submitKyc(idDocument: File, selfie: File, accessToken: string | null): Promise<KycSubmitResponse> {
  const formData = new FormData();
  formData.append("idDocument", idDocument);
  formData.append("selfie", selfie);

  return callApiOrMock<KycSubmitResponse>(
    "/api/auth/kyc/verify",
    {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: formData,
    },
    async () => {
      await wait(600);
      // Demo behavior: documents are auto-verified, no real biometric check runs.
      return { status: "verified" };
    },
    "submitKyc",
  );
}

// TODO(betselot): swap for real GET /api/auth/kyc/status once it exists.
// For local/demo use, append ?kycStatus=pending|submitted|verified|rejected to the
// page URL to force a specific state without touching code.
export function getKycStatus(fallback: KycStatus): Promise<KycStatusResponse> {
  const override = new URLSearchParams(window.location.search).get("kycStatus") as KycStatus | null;
  if (override && ["pending", "submitted", "verified", "rejected"].includes(override)) {
    return Promise.resolve({ status: override, reason: override === "rejected" ? "Document image was unclear." : null });
  }

  return callApiOrMock<KycStatusResponse>(
    "/api/auth/kyc/status",
    undefined,
    async () => ({ status: fallback, reason: null }),
    "getKycStatus",
  );
}

// TODO(betselot): swap for the real provider-profile endpoint once it exists
// (likely POST /api/marketplace/providers — no HTTP route is wired yet, only the
// `providers` table). Expected success data: { providerId }.
export function createProviderProfile(payload: ProviderProfilePayload): Promise<ProviderProfileResponse> {
  return callApiOrMock<ProviderProfileResponse>(
    "/api/marketplace/providers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    async () => {
      await wait(500);
      return { providerId: `mock-provider-${Date.now()}` };
    },
    "createProviderProfile",
  );
}
