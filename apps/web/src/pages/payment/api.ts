import type {
  ApiResponse,
  EscrowCheckoutPayload,
  EscrowCheckoutResponse,
  EscrowVerifyResponse,
} from "./types";

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? ""}${path}`;

async function callApi<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(apiUrl(path), options);
  return response.json() as Promise<ApiResponse<T>>;
}

/**
 * Tries Betselot's real endpoint first. Falls back to a contract-shaped mock
 * so the screen never blocks on backend availability (see individual TODOs
 * below for exactly what each mock stands in for).
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
  console.warn(`[payment] ${mockLabel}: backend not ready, using mocked response.`);
  return mock();
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// TODO(betselot): this already matches apps/api/src/modules/escrow/routes.ts POST
// /contracts contract, but that route is still a 501 stub. Once it's wired it must
// call Chapa's initialize endpoint server-side (never from the browser) using
// CHAPA_SECRET_KEY, and return { contractId, checkoutUrl } where checkoutUrl is
// Chapa's hosted checkout page.
export function createEscrowCheckout(payload: EscrowCheckoutPayload): Promise<EscrowCheckoutResponse> {
  return callApiOrMock<EscrowCheckoutResponse>(
    "/api/escrow/contracts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    async () => {
      await wait(500);
      // Local/demo only: instead of a real Chapa URL, redirect straight back to our
      // own return_url with a mock tx_ref so the return-handler screen is exercisable
      // end to end without a live Chapa sandbox.
      const contractId = `mock-contract-${Date.now()}`;
      const txRef = `mock-tx-${Date.now()}`;
      const checkoutUrl = `${payload.returnUrl}${payload.returnUrl.includes("?") ? "&" : "?"}tx_ref=${txRef}`;
      return { contractId, checkoutUrl };
    },
    "createEscrowCheckout",
  );
}

// TODO(betselot): no verify-by-tx_ref endpoint exists yet — only a server-to-server
// webhook (POST /api/escrow/webhooks/chapa). The frontend needs a dedicated
// GET /api/escrow/verify?tx_ref=... route it can call after Chapa redirects back,
// so the return screen can show a definitive success/failure state.
export function verifyEscrowPayment(txRef: string): Promise<EscrowVerifyResponse> {
  return callApiOrMock<EscrowVerifyResponse>(
    `/api/escrow/verify?tx_ref=${encodeURIComponent(txRef)}`,
    undefined,
    async () => {
      await wait(500);
      const isMockSuccess = txRef.startsWith("mock-tx-");
      return {
        contractId: txRef.replace("tx-", "contract-"),
        status: isMockSuccess ? "escrowed" : "failed",
      };
    },
    "verifyEscrowPayment",
  );
}
