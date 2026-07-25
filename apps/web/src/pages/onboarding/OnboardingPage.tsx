import { PagePlaceholder } from "../../components";

/**
 * Onboarding — phone OTP sign-in (Supabase), role choice, KYC upload.
 * Talks to: GET /api/auth/status, POST /api/auth/kyc/verify
 */
export function OnboardingPage() {
  return (
    <PagePlaceholder
      title="Onboarding"
      owner="Maramawit"
      folder="apps/web/src/pages/onboarding"
    >
      <ul>
        <li>Phone OTP sign-in via Supabase</li>
        <li>Choose role: user or provider</li>
        <li>ID + selfie upload for KYC</li>
      </ul>
    </PagePlaceholder>
  );
}
