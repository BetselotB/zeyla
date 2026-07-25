import { useState } from "react";
import { IdCaptureField } from "./IdCaptureField";
import { SelfieCaptureField } from "./SelfieCaptureField";

type KycUploadStepProps = {
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (idDocument: File, selfie: File) => void;
};

export function KycUploadStep({ isSubmitting, error, onSubmit }: KycUploadStepProps) {
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);

  const canSubmit = Boolean(idDocument && selfie) && !isSubmitting;

  return (
    <div className="onboarding__form">
      <p className="onboarding__hint">Upload a government-issued ID and take a selfie to verify your identity.</p>
      <IdCaptureField label="Government-issued ID" onCapture={setIdDocument} />
      <SelfieCaptureField onCapture={setSelfie} />
      {error && (
        <p className="onboarding__notice onboarding__notice--error" role="alert">
          {error}
        </p>
      )}
      <button
        className="onboarding__button"
        disabled={!canSubmit}
        type="button"
        onClick={() => idDocument && selfie && onSubmit(idDocument, selfie)}
      >
        {isSubmitting ? "Submitting…" : "Submit documents"}
      </button>
    </div>
  );
}
