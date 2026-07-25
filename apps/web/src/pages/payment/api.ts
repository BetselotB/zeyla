import type { ApiResponse, AuthUser, Contract, CreateContractBody, FundContractBody, FundContractResponse } from "@zeyla/shared";
import { authHeaders } from "./authToken";

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? ""}${path}`;

async function callApi<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(apiUrl(path), options);
  return (await response.json()) as ApiResponse<T>;
}

/**
 * Throws on failure, using the backend's snake_case error code as the message
 * (e.g. "email_required_for_checkout", "missing_bearer_token") so callers can
 * match on it instead of parsing prose. See docs/api/identity-money.md.
 */
async function callApiRequired<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await callApi<T>(path, options);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "request_failed");
  }
  return response.data;
}

/** Used only to prefill the receipt-email field and to detect a signed-out visitor. */
export function getMe(): Promise<AuthUser> {
  return callApiRequired<AuthUser>("/api/auth/me", { headers: authHeaders() });
}

/** Auth required — the caller becomes the payer. Status starts at "awaiting_escrow". */
export function createContract(body: CreateContractBody): Promise<Contract> {
  return callApiRequired<Contract>("/api/escrow/contracts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
}

/** Auth required, payer only. Returns the Chapa (or simulated) checkoutUrl to redirect to. */
export function fundContract(contractId: string, body: FundContractBody): Promise<FundContractResponse> {
  return callApiRequired<FundContractResponse>(`/api/escrow/contracts/${contractId}/fund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
}

/**
 * The return_url is not proof of payment — poll this until status flips to
 * "escrowed" rather than trusting the redirect alone (see docs/api/identity-money.md).
 */
export function getContract(contractId: string): Promise<Contract> {
  return callApiRequired<Contract>(`/api/escrow/contracts/${contractId}`, { headers: authHeaders() });
}
