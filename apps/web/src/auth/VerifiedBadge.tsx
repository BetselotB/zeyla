import type { KycStatus } from "@zeyla/shared";
import "./auth.css";

const LABELS: Record<KycStatus, string | null> = {
  verified: "Verified",
  manual_review: "Verification in review",
  pending: null,
  rejected: null,
};

/**
 * Identity badge shown once KYC clears.
 *
 * HACKATHON SHORTCUT: with KYC_AUTO_VERIFY on, uploading an ID and a selfie
 * flips the account to verified with no biometric comparison, so every user
 * earns this badge within seconds. Keep the wording to "verified" — anything
 * implying a live face match would be a claim the backend does not make.
 */
export function VerifiedBadge({ status }: { status: KycStatus }) {
  const label = LABELS[status];
  if (!label) return null;

  return (
    <span className="auth-verified-badge">
      <span className="auth-verified-badge__check" aria-hidden="true">
        ✓
      </span>
      {label}
    </span>
  );
}
