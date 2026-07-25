/**
 * Local-only types for the parts of onboarding that aren't in @zeyla/shared
 * yet — OTP, KYC, and account fields are real (import those from
 * @zeyla/shared directly). Provider business details below are still mocked;
 * see the TODO(mohammed) in api.ts.
 */

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
