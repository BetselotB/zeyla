import { useState } from "react";
import { createProviderProfile, getKycStatus, requestOtp, submitKyc, verifyOtp } from "./api";
import { KycStatusScreen } from "./components/KycStatusScreen";
import { KycUploadStep } from "./components/KycUploadStep";
import { OtpStep } from "./components/OtpStep";
import { PhoneStep } from "./components/PhoneStep";
import { ProviderProfileForm } from "./components/ProviderProfileForm";
import "./OnboardingPage.css";
import type { KycStatus, ProviderProfilePayload } from "./types";

type Step = "phone" | "otp" | "kycUpload" | "kycStatus" | "providerPrompt" | "providerProfile" | "done";

export function OnboardingPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [requestId, setRequestId] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatus>("submitted");
  const [kycReason, setKycReason] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhoneSubmit = async (fullPhone: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await requestOtp(fullPhone);
      setPhone(fullPhone);
      setRequestId(result.requestId);
      setStep("otp");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send the code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (code: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await verifyOtp(phone, requestId, code);
      setAccessToken(result.accessToken);
      setStep("kycUpload");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "That code didn't work. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      const result = await requestOtp(phone);
      setRequestId(result.requestId);
    } finally {
      setIsResending(false);
    }
  };

  const handleKycSubmit = async (idDocument: File, selfie: File) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const submitResult = await submitKyc(idDocument, selfie, accessToken);
      const statusResult = await getKycStatus(submitResult.status);
      setKycStatus(statusResult.status);
      setKycReason(statusResult.reason);
      setStep("kycStatus");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We couldn't submit your documents. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProviderProfileSubmit = async (payload: ProviderProfilePayload, _photo: File | null) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await createProviderProfile(payload);
      setStep("done");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "We couldn't create your profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Phase drives the slim dot indicator only — no labels are rendered.
  const phaseByStep: Record<Step, number> = {
    phone: 0,
    otp: 0,
    kycUpload: 1,
    kycStatus: 1,
    providerPrompt: 2,
    providerProfile: 2,
    done: 2,
  };
  const phase = phaseByStep[step];

  const cardHeading: Partial<Record<Step, string>> = {
    phone: "Enter your phone number",
    otp: "Verify your number",
    kycUpload: "Verify your identity",
    providerPrompt: "Offer services on Zeyla?",
    providerProfile: "Set up your provider profile",
  };

  return (
    <main className="onboarding">
      <header className="onboarding__topbar">
        <span className="onboarding__wordmark">Zeyla</span>
      </header>

      <div className="onboarding__dots" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={phase + 1} aria-label="Onboarding progress">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className={`onboarding__dot ${dot === phase ? "is-active" : dot < phase ? "is-complete" : ""}`} />
        ))}
      </div>

      <section className="onboarding__card">
        {cardHeading[step] && <h2 className="onboarding__card-heading">{cardHeading[step]}</h2>}

        {step === "phone" && <PhoneStep isSubmitting={isSubmitting} onSubmit={handlePhoneSubmit} />}

        {step === "otp" && (
          <OtpStep
            phone={phone}
            isSubmitting={isSubmitting}
            isResending={isResending}
            error={error}
            onSubmit={handleOtpSubmit}
            onResend={handleResend}
            onChangeNumber={() => setStep("phone")}
          />
        )}

        {step === "kycUpload" && <KycUploadStep isSubmitting={isSubmitting} error={error} onSubmit={handleKycSubmit} />}

        {step === "kycStatus" && (
          <KycStatusScreen
            status={kycStatus}
            reason={kycReason}
            onResubmit={() => setStep("kycUpload")}
            onContinue={() => setStep("providerPrompt")}
          />
        )}

        {step === "providerPrompt" && (
          <div className="onboarding__form">
            <div className="onboarding__actions">
              <button className="onboarding__button" type="button" onClick={() => setStep("providerProfile")}>
                Set up provider profile
              </button>
              <button className="onboarding__button onboarding__button--secondary" type="button" onClick={() => setStep("done")}>
                Not now
              </button>
            </div>
          </div>
        )}

        {step === "providerProfile" && (
          <ProviderProfileForm
            isSubmitting={isSubmitting}
            error={error}
            onSubmit={handleProviderProfileSubmit}
            onSkip={() => setStep("done")}
          />
        )}

        {step === "done" && (
          <div className="onboarding__form">
            <div className="onboarding__status">
              <span className="onboarding__status-icon">✓</span>
              <div>
                <strong>You're all set</strong>
                <p className="onboarding__hint">You can now discover services and fund work through escrow.</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
