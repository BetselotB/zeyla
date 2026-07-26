/**
 * Wire contracts for the Identity & Money module (owner: @betselot).
 *
 * These are the exact request/response payloads served under `/api/auth/*`
 * and `/api/escrow/*`. Frontend imports these instead of re-declaring shapes,
 * so a backend change that breaks the UI breaks the typecheck first.
 *
 * Every response is wrapped in `ApiResponse<T>` from ./index — the types below
 * describe the `data` field only.
 */

import type { ContractStatus, EscrowStatus, KycStatus, UserRole } from "./index.js";

/** How the account was first created. Not a list of every linked identity. */
export type AuthProvider = "phone" | "email" | "google";

/** A user as the API returns it. Never includes tokens or raw KYC paths. */
export interface AuthUser {
  id: string;
  /** Null for accounts created with email/password or Google. */
  phone: string | null;
  name: string | null;
  /** Needed before Chapa checkout. Null for accounts created phone-only. */
  email: string | null;
  avatarUrl: string | null;
  authProvider: AuthProvider | null;
  role: UserRole;
  kycStatus: KycStatus;
  kycSubmittedAt: string | null;
  kycReviewedAt: string | null;
  /**
   * False until the signup flow is finished. A token alone does not mean the
   * account is usable — the web app routes everyone to /onboarding until this
   * flips.
   */
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface AuthStatusResponse {
  provider: "mock" | "supabase";
  supabaseConfigured: boolean;
  demoMode: boolean;
  /** True when OTP codes come back in the request response instead of by SMS. */
  otpCodesReturnedInResponse: boolean;
  /** True when this API can verify Supabase email/password and Google tokens. */
  supabaseAuthEnabled: boolean;
}

/**
 * Trades a Supabase access token (email/password or Google) for the matching
 * Zeyla account, creating it on first sign-in. Send the Supabase token as the
 * bearer; the client keeps using that same token afterwards, since Supabase
 * refreshes it and this API only verifies it.
 */
export interface SyncSessionResponse {
  /** True when this call created the Zeyla account rather than finding it. */
  isNewUser: boolean;
  user: AuthUser;
}

export interface RequestOtpBody {
  /** E.164 preferred, e.g. "+251911223344". Local "09..." is normalised. */
  phone: string;
}

export interface RequestOtpResponse {
  phone: string;
  expiresInSeconds: number;
  /** Present only when AUTH_OTP_PROVIDER=mock. Never present in production. */
  devCode?: string;
}

export interface VerifyOtpBody {
  phone: string;
  code: string;
}

export interface VerifyOtpResponse {
  token: string;
  expiresAt: string;
  /** True when this OTP created the account rather than logging one in. */
  isNewUser: boolean;
  user: AuthUser;
}

export interface UpdateProfileBody {
  name?: string;
  email?: string;
  role?: UserRole;
}

/** Response of POST /api/auth/onboarding/complete. */
export interface CompleteOnboardingResponse {
  user: AuthUser;
}

/**
 * KYC upload. Images are base64 data (with or without a `data:` URL prefix) so
 * the frontend can post plain JSON instead of multipart.
 */
export interface KycUploadBody {
  idDocBase64: string;
  selfieBase64: string;
  idDocMimeType?: string;
  selfieMimeType?: string;
}

export interface KycStatusResponse {
  kycStatus: KycStatus;
  idDocUrl: string | null;
  selfieUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  note: string | null;
  /**
   * True when the status was set without any human or biometric check.
   * The UI must not present this as a completed face match.
   */
  autoVerified: boolean;
}

export interface EscrowLedgerEntry {
  id: string;
  contractId: string;
  amount: number;
  currency: string;
  platformFee: number;
  providerPayout: number | null;
  status: EscrowStatus;
  chapaTxRef: string | null;
  chapaTransferRef: string | null;
  checkoutUrl: string | null;
  createdAt: string;
  heldAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
}

export interface ContractEvent {
  id: string;
  contractId: string;
  fromStatus: ContractStatus | null;
  toStatus: ContractStatus;
  actor: string;
  reason: string | null;
  createdAt: string;
}

export interface Contract {
  id: string;
  requestId: string | null;
  userId: string;
  providerId: string;
  title: string | null;
  agreedAmount: number;
  currency: string;
  status: ContractStatus;
  createdAt: string;
  statusUpdatedAt: string;
  completedAt: string | null;
  ledger: EscrowLedgerEntry | null;
}

/**
 * The payment state of one job, flattened for display.
 *
 * Both sides of a job need the same answer to "has this been paid for?", and
 * neither should have to know that the answer is spread across a contract
 * status and an escrow ledger status. `isPaid` is the single flag the UI keys
 * off; the rest is there to explain it.
 */
export interface JobPaymentSummary {
  contractId: string;
  requestId: string | null;
  /** The payer. */
  userId: string;
  providerId: string;
  status: ContractStatus;
  /** Null until the payer has started a checkout. */
  escrowStatus: EscrowStatus | null;
  amount: number;
  currency: string;
  /**
   * True once Chapa's webhook has confirmed the money is with us — held in
   * escrow, or already released to the provider on completion. This is the
   * flag that turns both dashboards green, and it is never set by a browser
   * redirect: only the signed webhook moves the ledger off `pending`.
   */
  isPaid: boolean;
  /** When the funds landed in escrow. */
  paidAt: string | null;
  /** Set once the job is done and the provider has been paid out. */
  releasedAt: string | null;
}

/** Response of GET /api/escrow/requests/:requestId/contract. */
export interface RequestContractResponse {
  /** Null when the customer has not started checkout for this request yet. */
  contract: Contract | null;
  payment: JobPaymentSummary | null;
}

/**
 * Flattens a contract into the shape both dashboards render.
 *
 * A contract can be `completed` with the ledger already `released`, which is
 * still "the customer paid" — so this keys off the ledger having left
 * `pending` rather than off the contract status, which goes on moving after
 * the money has landed.
 */
export function toJobPaymentSummary(contract: Contract): JobPaymentSummary {
  const ledger = contract.ledger;
  const escrowStatus = ledger?.status ?? null;

  return {
    contractId: contract.id,
    requestId: contract.requestId,
    userId: contract.userId,
    providerId: contract.providerId,
    status: contract.status,
    escrowStatus,
    amount: contract.agreedAmount,
    currency: contract.currency,
    isPaid: escrowStatus === "held" || escrowStatus === "released",
    paidAt: ledger?.heldAt ?? null,
    releasedAt: ledger?.releasedAt ?? null,
  };
}

export interface CreateContractBody {
  providerId: string;
  agreedAmount: number;
  /** Optional link to a marketplace service_request, when one exists. */
  requestId?: string;
  title?: string;
  currency?: string;
}

export interface FundContractBody {
  /** Overrides the default built from WEB_APP_URL. */
  returnUrl?: string;
  /**
   * Receipt address for this payment. Falls back to the profile email, then to
   * the server's CHAPA_FALLBACK_EMAIL. Chapa rejects domains with no MX record.
   */
  email?: string;
}

export interface FundContractResponse {
  contractId: string;
  txRef: string;
  amount: number;
  currency: string;
  /** Send the browser here. Chapa-hosted in production, local in demo mode. */
  checkoutUrl: string;
  /** True when checkoutUrl is this API's simulator rather than Chapa. */
  simulated: boolean;
}

export interface TransitionBody {
  reason?: string;
}

export interface StateMachineResponse {
  demoMode: boolean;
  chapaConfigured: boolean;
  platformFeePercent: number;
  transitions: Record<ContractStatus, ContractStatus[]>;
}

/** Redis pub/sub channel the escrow module publishes transitions on. */
export const CONTRACT_EVENTS_CHANNEL = "zeyla:contract-events";

/** Payload published on CONTRACT_EVENTS_CHANNEL for realtime/notifications. */
export interface ContractEventMessage {
  contractId: string;
  userId: string;
  providerId: string;
  fromStatus: ContractStatus | null;
  toStatus: ContractStatus;
  amount: number;
  currency: string;
  at: string;
}
