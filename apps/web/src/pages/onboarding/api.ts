import type {
  ApiResponse,
  AuthUser,
  KycStatusResponse,
  ProviderProfileInput,
  ProviderProfileResponse,
  RequestOtpResponse,
  UpdateProfileBody,
  VerifyOtpResponse,
} from "@zeyla/shared";
import { authHeaders } from "./authToken";
import { fileToBase64 } from "./fileToBase64";

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? ""}${path}`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ApiCall<T> = { status: number; body: ApiResponse<T> };

async function callApi<T>(path: string, options?: RequestInit): Promise<ApiCall<T>> {
  const response = await fetch(apiUrl(path), options);
  const body = (await response.json()) as ApiResponse<T>;
  return { status: response.status, body };
}

/**
 * Calls the real endpoint (see docs/api/identity-money.md) and falls back to a
 * contract-shaped mock **only in dev, and only when the API itself is
 * unreachable or broken** — e.g. Postgres isn't running locally. Real
 * business errors (`bad_code`, `invalid_phone`, `expired`, …) are always
 * rethrown so those UI states stay testable, and production never mocks.
 */
async function callApiOrMock<T>(
  path: string,
  options: RequestInit | undefined,
  mock: () => Promise<T>,
  label: string,
): Promise<T> {
  let apiError: string | null = null;

  try {
    const { status, body } = await callApi<T>(path, options);
    if (body.success && body.data) return body.data;
    const code = body.error ?? "";
    // 4xx with a real code is the API telling us something actionable.
    if (code && code !== "not_implemented" && status < 500) apiError = code;
  } catch {
    // Network-level failure: API not running, CORS, DNS. Falls through to mock.
  }

  if (apiError) throw new Error(apiError);
  if (!import.meta.env.DEV) throw new Error("service_unavailable");

  console.warn(`[onboarding] ${label}: API unavailable, using mocked response (dev only).`);
  return mock();
}

// --- Mock session state (dev only) -------------------------------------------
// Kept in memory so the mocked flow behaves like a real session: the email and
// role set during onboarding persist across subsequent calls.

const mockUser: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  phone: "+251900000000",
  name: null,
  email: null,
  avatarUrl: null,
  authProvider: "phone",
  role: "user",
  kycStatus: "pending",
  kycSubmittedAt: null,
  kycReviewedAt: null,
  onboardingCompleted: false,
  createdAt: new Date().toISOString(),
};

function mockKycStatus(): KycStatusResponse {
  return {
    kycStatus: mockUser.kycStatus,
    idDocUrl: mockUser.kycSubmittedAt ? `/api/auth/kyc/file/${mockUser.id}/id-mock.png` : null,
    selfieUrl: mockUser.kycSubmittedAt ? `/api/auth/kyc/file/${mockUser.id}/selfie-mock.png` : null,
    submittedAt: mockUser.kycSubmittedAt,
    reviewedAt: mockUser.kycReviewedAt,
    note: null,
    autoVerified: mockUser.kycStatus === "verified",
  };
}

// --- Auth --------------------------------------------------------------------

export function requestOtp(phone: string): Promise<RequestOtpResponse> {
  return callApiOrMock<RequestOtpResponse>(
    "/api/auth/otp/request",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    },
    async () => {
      await wait(350);
      mockUser.phone = phone;
      return { phone, expiresInSeconds: 300 };
    },
    "requestOtp",
  );
}

/**
 * Returns the token; it is the caller's job to adopt it into the session
 * (`useAuth().adoptApiSession`) so the whole app sees the sign-in at once.
 */
export function verifyOtp(phone: string, code: string): Promise<VerifyOtpResponse> {
  return callApiOrMock<VerifyOtpResponse>(
    "/api/auth/otp/verify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    },
    async () => {
      await wait(350);
      mockUser.phone = phone;
      return {
        token: `mock-token-${Date.now()}`,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        isNewUser: true,
        user: { ...mockUser },
      };
    },
    "verifyOtp",
  );
}

export function getMe(): Promise<AuthUser> {
  return callApiOrMock<AuthUser>("/api/auth/me", { headers: authHeaders() }, async () => ({ ...mockUser }), "getMe");
}

export function updateProfile(body: UpdateProfileBody): Promise<AuthUser> {
  return callApiOrMock<AuthUser>(
    "/api/auth/me",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    },
    async () => {
      await wait(300);
      if (body.email !== undefined) mockUser.email = body.email;
      if (body.name !== undefined) mockUser.name = body.name;
      if (body.role !== undefined) mockUser.role = body.role;
      return { ...mockUser };
    },
    "updateProfile",
  );
}

// --- KYC ---------------------------------------------------------------------
// Real endpoint takes base64 JSON, not multipart — see docs/api/identity-money.md.

export async function submitKyc(idDocument: File, selfie: File): Promise<KycStatusResponse> {
  const [idDocBase64, selfieBase64] = await Promise.all([fileToBase64(idDocument), fileToBase64(selfie)]);
  return callApiOrMock<KycStatusResponse>(
    "/api/auth/kyc/upload",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ idDocBase64, selfieBase64 }),
    },
    async () => {
      await wait(600);
      const now = new Date().toISOString();
      // Mirrors KYC_AUTO_VERIFY=true, the local default: documents are stored
      // and marked verified on arrival, with no biometric comparison.
      mockUser.kycStatus = "verified";
      mockUser.kycSubmittedAt = now;
      mockUser.kycReviewedAt = now;
      return mockKycStatus();
    },
    "submitKyc",
  );
}

export function getKycStatus(): Promise<KycStatusResponse> {
  return callApiOrMock<KycStatusResponse>(
    "/api/auth/kyc/status",
    { headers: authHeaders() },
    async () => mockKycStatus(),
    "getKycStatus",
  );
}

// --- Provider profile --------------------------------------------------------

/**
 * Creates the provider profile and promotes the account to the `provider` role
 * in one call. Idempotent server-side, so a retry after a failed submit updates
 * the profile rather than creating a second one.
 */
export function createProviderProfile(
  payload: ProviderProfileInput,
): Promise<ProviderProfileResponse> {
  return callApiOrMock<ProviderProfileResponse>(
    "/api/marketplace/providers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    },
    async () => {
      await wait(400);
      return {
        created: true,
        provider: {
          providerId: mockUser.id,
          category: payload.category,
          businessName: payload.businessName,
          subCity: payload.subCity,
          bio: payload.bio,
          experienceYears: payload.experienceYears,
          priceMin: payload.priceMin,
          priceMax: payload.priceMax,
          contactPhone: payload.contactPhone ?? null,
          serviceRadiusMeters: payload.serviceRadiusMeters ?? 10_000,
          trustScore: 60,
          isOnline: false,
          lat: null,
          lng: null,
          createdFromSubCityCentroid: true,
        },
      };
    },
    "createProviderProfile",
  );
}
