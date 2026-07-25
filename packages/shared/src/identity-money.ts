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

/** A user as the API returns it. Never includes tokens or raw KYC paths. */
export interface AuthUser {
  id: string;
  phone: string;
  name: string | null;
  /** Needed before Chapa checkout — accounts are created phone-only. */
  email: string | null;
  role: UserRole;
  kycStatus: KycStatus;
  kycSubmittedAt: string | null;
  kycReviewedAt: string | null;
  createdAt: string;
}

export interface AuthStatusResponse {
  provider: "mock" | "supabase";
  supabaseConfigured: boolean;
  demoMode: boolean;
  /** True when OTP codes come back in the request response instead of by SMS. */
  otpCodesReturnedInResponse: boolean;
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
