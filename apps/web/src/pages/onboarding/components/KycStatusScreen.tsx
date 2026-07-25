import type { KycStatus } from "@zeyla/shared";

type KycStatusScreenProps = {
  status: KycStatus;
  onResubmit: () => void;
  onContinue: () => void;
};

/**
 * Outcome of a KYC submission. The heading and supporting copy live in the
 * page hero (OnboardingPage) so there's one source of truth per status; this
 * only renders the badge and the action.
 *
 * "Verified" means the demo auto-verifies submitted documents (see
 * `autoVerified` on the API response) — never present it as a completed face
 * match or liveness check.
 */
export function KycStatusScreen({ status, onResubmit, onContinue }: KycStatusScreenProps) {
  const isRejected = status === "rejected";
  const isVerified = status === "verified";

  return (
    <div className="onboarding__form">
      <div className="onboarding__status">
        <span className={`onboarding__status-icon ${isRejected ? "onboarding__status-icon--warn" : ""}`}>
          {isRejected ? "!" : isVerified ? "✓" : "…"}
        </span>
      </div>

      {isRejected ? (
        <button className="onboarding__button" type="button" onClick={onResubmit}>
          Upload documents again
        </button>
      ) : (
        <button className="onboarding__button" type="button" onClick={onContinue}>
          Continue
        </button>
      )}
    </div>
  );
}
