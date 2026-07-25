/**
 * Contract types for the onboarding flow (login/OTP, KYC, provider profile).
 * Mirrors the `{ success, data, error }` envelope from apps/api/src/lib/respond.ts.
 * Keep these in sync with Betselot's real routes as they land — see api.ts
 * for exactly which calls are still mocked.
 */

export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

export type OtpRequestResponse = {
  requestId: string;
  expiresInSeconds: number;
};

export type OtpVerifyResponse = {
  accessToken: string;
  userId: string;
  role: "user" | "provider" | null;
};

export type KycStatus = "pending" | "submitted" | "verified" | "rejected";

export type KycStatusResponse = {
  status: KycStatus;
  reason: string | null;
};

export type KycSubmitResponse = {
  status: KycStatus;
};

export type ProviderProfilePayload = {
  fullName: string;
  businessName: string;
  category: string;
  subCity: string;
  phone: string;
  bio: string;
  experienceYears: number;
  priceRangeMin: number;
  priceRangeMax: number;
};

export type ProviderProfileResponse = {
  providerId: string;
};
