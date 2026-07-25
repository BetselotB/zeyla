/**
 * Contract types for escrow funding / checkout.
 * Mirrors the `{ success, data, error }` envelope from apps/api/src/lib/respond.ts.
 */

export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

export type ContractStatus = "awaiting_escrow" | "escrowed" | "active" | "completed" | "disputed" | "failed";

export type BookingSummaryData = {
  providerId: string;
  providerName: string;
  description: string;
  amount: number;
  currency: string;
};

export type EscrowCheckoutPayload = {
  providerId: string;
  description: string;
  amount: number;
  currency: string;
  returnUrl: string;
};

export type EscrowCheckoutResponse = {
  contractId: string;
  /** Chapa's hosted checkout page — the frontend only ever redirects to this URL. */
  checkoutUrl: string;
};

export type EscrowVerifyResponse = {
  contractId: string;
  status: ContractStatus;
};
