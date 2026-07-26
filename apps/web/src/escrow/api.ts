import type { ApiResponse, Contract, RequestContractResponse } from "@zeyla/shared";
import { API_BASE, authHeaders } from "../auth/session";

/**
 * The escrow calls both sides of a job make.
 *
 * Funding lives on the checkout page; this covers reading where the money is
 * and the two lifecycle moves either party can make once it is there. Nothing
 * here decides anything — the server owns the state machine and rejects a
 * transition it does not allow.
 */

async function call<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: await authHeaders(),
  });
  const envelope = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!envelope?.success || envelope.data == null) {
    throw new Error(envelope?.error ?? `request_failed_${res.status}`);
  }
  return envelope.data;
}

const get = <T>(path: string) => call<T>(path);

/**
 * The contract covering a service request, from the point of view of whoever
 * is asking. Both fields come back null when checkout has not started, which
 * is the normal state for a job a provider has only just accepted.
 */
export function getContractForRequest(
  requestId: string,
): Promise<RequestContractResponse> {
  return get<RequestContractResponse>(
    `/escrow/requests/${encodeURIComponent(requestId)}/contract`,
  );
}

/**
 * `escrowed` -> `active`: the work has begun. Either party may call it, so a
 * provider who forgets does not strand the customer.
 */
export function startWork(contractId: string): Promise<Contract> {
  return call<Contract>(
    `/escrow/contracts/${encodeURIComponent(contractId)}/start`,
    "POST",
  );
}

/**
 * `active` -> `completed`, which releases the escrow to the provider. Payer
 * only — this is the customer's confirmation that the work was actually done.
 */
export function completeContract(
  contractId: string,
): Promise<{ contract: Contract; payoutError?: string }> {
  return call<{ contract: Contract; payoutError?: string }>(
    `/escrow/contracts/${encodeURIComponent(contractId)}/complete`,
    "POST",
  );
}
