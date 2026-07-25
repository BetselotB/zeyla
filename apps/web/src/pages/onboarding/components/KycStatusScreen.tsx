import type { KycStatus } from "@zeyla/shared";

type KycStatusScreenProps = {
  status: KycStatus;
  onResubmit: () => void;
  onContinue: () => void;
};

/**
 * Neutral, honest copy only. "Verified" here means the demo auto-verifies
 * submitted documents (see `autoVerified` in the real API response) — it
 * never implies a live face-match, confidence score, or liveness check
 * took place.
 */
export function KycStatusScreen({ status, onResubmit, onContinue }: KycStatusScreenProps) {
  if (status === "manual_review" || status === "pending") {
    return (
      <div className="onboarding__form">
        <div className="onboarding__status">
          <span className="onboarding__status-icon">i</span>
          <div>
            <strong>Documents received</strong>
            <p className="onboarding__hint">Your identity documents are under review. This usually only takes a moment.</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="onboarding__form">
        <div className="onboarding__status">
          <span className="onboarding__status-icon onboarding__status-icon--warn">!</span>
          <div>
            <strong>We couldn't verify your documents</strong>
            <p className="onboarding__hint">Please make sure your ID and selfie are clear, then try again.</p>
          </div>
        </div>
        <button className="onboarding__button" type="button" onClick={onResubmit}>
          Resubmit documents
        </button>
      </div>
    );
  }

  return (
    <div className="onboarding__form">
      <div className="onboarding__status">
        <span className="onboarding__status-icon">✓</span>
        <div>
          <strong>Identity verified</strong>
          <p className="onboarding__hint">You can now use Zeyla to book or offer services.</p>
        </div>
      </div>
      <button className="onboarding__button" type="button" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
