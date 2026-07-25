import type {
  ApiResponse,
  AuthUser,
  Contract,
  CreateContractBody,
  FundContractBody,
  FundContractResponse,
  PingDto,
  ProviderDetail,
  ServiceRequestDto,
} from "@zeyla/shared";
import { authHeaders } from "./authToken";

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
 * unreachable or broken** — e.g. Postgres isn't running locally. Real business
 * errors (`email_required_for_checkout`, `only_the_payer_can_fund`,
 * `missing_bearer_token`, …) are always rethrown so those UI states stay
 * testable, and production never mocks.
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

  console.warn(`[payment] ${label}: API unavailable, using mocked response (dev only).`);
  return mock();
}

// --- Mock session state (dev only) -------------------------------------------
// Contracts created in this tab, so create → fund → return behaves like the
// real thing. Redirecting to checkout reloads the page and clears this, so
// mockContract() also synthesises unknown ids as already funded.

const PLATFORM_FEE_PERCENT = 5;

const mockContracts = new Map<string, Contract>();

const mockUser: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  phone: "+251900000000",
  name: null,
  email: null,
  role: "user",
  kycStatus: "verified",
  kycSubmittedAt: new Date().toISOString(),
  kycReviewedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

function mockEscrowed(contract: Contract): Contract {
  const now = new Date().toISOString();
  return {
    ...contract,
    status: "escrowed",
    statusUpdatedAt: now,
    ledger: {
      id: `mock-ledger-${contract.id}`,
      contractId: contract.id,
      amount: contract.agreedAmount,
      currency: contract.currency,
      platformFee: Math.round(contract.agreedAmount * PLATFORM_FEE_PERCENT) / 100,
      providerPayout: null,
      status: "held",
      chapaTxRef: `mock-tx-${contract.id}`,
      chapaTransferRef: null,
      checkoutUrl: null,
      createdAt: now,
      heldAt: now,
      releasedAt: null,
      refundedAt: null,
    },
  };
}

// --- Marketplace (the booking being paid for) --------------------------------

type ServiceRequestDetail = { request: ServiceRequestDto; pings: PingDto[] };

/**
 * The accepted service request this payment is for, with its pings so we can
 * tell which provider took the job (see marketplace/API.md — accepting a ping
 * deliberately does not create a contract; that's this page's job).
 */
export function getServiceRequest(requestId: string): Promise<ServiceRequestDetail> {
  return callApiOrMock<ServiceRequestDetail>(
    `/api/marketplace/requests/${requestId}`,
    { headers: authHeaders() },
    async () => {
      await wait(350);
      const now = new Date().toISOString();
      const request: ServiceRequestDto = {
        id: requestId,
        userId: mockUser.id,
        category: "plumber",
        description: "Kitchen pipe burst, water everywhere",
        urgency: "emergency",
        lat: 8.995,
        lng: 38.787,
        addressLabel: "Bole Medhanialem, behind the church",
        radiusMeters: 3000,
        status: "accepted",
        voiceTranscript: null,
        nlp: null,
        createdAt: now,
      };
      const ping: PingDto = {
        id: `mock-ping-${requestId}`,
        requestId,
        providerId: "mock-provider",
        status: "accepted",
        distanceMeters: 322,
        trustScoreAtPing: 78.5,
        sentAt: now,
        seenAt: now,
        respondedAt: now,
        expiresAt: null,
      };
      return { request, pings: [ping] };
    },
    "getServiceRequest",
  );
}

/** Public endpoint — used only to put a real name on the booking summary. */
export function getProvider(providerId: string): Promise<ProviderDetail> {
  return callApiOrMock<ProviderDetail>(
    `/api/marketplace/providers/${providerId}`,
    undefined,
    async () => {
      await wait(250);
      return {
        id: providerId,
        name: "Abebe Tadesse",
        category: "plumber",
        bio: "15 years on burst pipes and water heaters.",
        experienceYears: 15,
        trustScore: 78.5,
        isOnline: true,
        kycStatus: "verified",
        firecrawlVerified: false,
        lat: 9.0312,
        lng: 38.7601,
        distanceMeters: 284,
        avgRating: 4.67,
        reviewCount: 12,
        completedContracts: 9,
        lastSeenAt: new Date().toISOString(),
        recentReviews: [],
      };
    },
    "getProvider",
  );
}

// --- Identity, escrow --------------------------------------------------------

/** Used to prefill the receipt-email field and detect a signed-out visitor. */
export function getMe(): Promise<AuthUser> {
  return callApiOrMock<AuthUser>("/api/auth/me", { headers: authHeaders() }, async () => ({ ...mockUser }), "getMe");
}

/** Auth required — the caller becomes the payer. Status starts at "awaiting_escrow". */
export function createContract(body: CreateContractBody): Promise<Contract> {
  return callApiOrMock<Contract>(
    "/api/escrow/contracts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    },
    async () => {
      await wait(400);
      const now = new Date().toISOString();
      const contract: Contract = {
        id: `mock-contract-${Date.now()}`,
        requestId: body.requestId ?? null,
        userId: mockUser.id,
        providerId: body.providerId,
        title: body.title ?? null,
        agreedAmount: body.agreedAmount,
        currency: body.currency ?? "ETB",
        status: "awaiting_escrow",
        createdAt: now,
        statusUpdatedAt: now,
        completedAt: null,
        ledger: null,
      };
      mockContracts.set(contract.id, contract);
      return contract;
    },
    "createContract",
  );
}

/** Auth required, payer only. Returns the Chapa (or simulated) checkoutUrl to redirect to. */
export function fundContract(contractId: string, body: FundContractBody): Promise<FundContractResponse> {
  return callApiOrMock<FundContractResponse>(
    `/api/escrow/contracts/${contractId}/fund`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    },
    async () => {
      await wait(450);
      const existing = mockContracts.get(contractId);
      if (existing) mockContracts.set(contractId, mockEscrowed(existing));
      // No Chapa page to send the browser to, so stand in for it by returning
      // straight to our own return_url — the same round trip the real hosted
      // checkout performs.
      return {
        contractId,
        txRef: `mock-tx-${contractId}`,
        amount: existing?.agreedAmount ?? 0,
        currency: existing?.currency ?? "ETB",
        checkoutUrl: body.returnUrl ?? `${window.location.origin}/payment?contract=${contractId}`,
        simulated: true,
      };
    },
    "fundContract",
  );
}

/**
 * The return_url is not proof of payment — poll this until status flips to
 * "escrowed" rather than trusting the redirect (see docs/api/identity-money.md).
 */
export function getContract(contractId: string): Promise<Contract> {
  return callApiOrMock<Contract>(
    `/api/escrow/contracts/${contractId}`,
    { headers: authHeaders() },
    async () => {
      await wait(350);
      const existing = mockContracts.get(contractId);
      if (existing) return existing.status === "awaiting_escrow" ? mockEscrowed(existing) : existing;
      const now = new Date().toISOString();
      return mockEscrowed({
        id: contractId,
        requestId: null,
        userId: mockUser.id,
        providerId: "mock-provider",
        title: null,
        agreedAmount: 0,
        currency: "ETB",
        status: "awaiting_escrow",
        createdAt: now,
        statusUpdatedAt: now,
        completedAt: null,
        ledger: null,
      });
    },
    "getContract",
  );
}
