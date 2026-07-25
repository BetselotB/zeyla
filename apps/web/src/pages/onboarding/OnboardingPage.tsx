import { useState } from "react";
import type { KycStatus } from "@zeyla/shared";
import { createProviderProfile, requestOtp, submitKyc, updateProfile, verifyOtp } from "./api";
import { EmailStep } from "./components/EmailStep";
import { KycStatusScreen } from "./components/KycStatusScreen";
import { KycUploadStep } from "./components/KycUploadStep";
import { OtpStep } from "./components/OtpStep";
import { PhoneStep } from "./components/PhoneStep";
import { ProviderProfileForm } from "./components/ProviderProfileForm";
import "./OnboardingPage.css";
import type { ProviderProfilePayload } from "./types";

type Step = "phone" | "otp" | "email" | "kycUpload" | "kycStatus" | "providerPrompt" | "providerProfile" | "done";

/** Phase 0 = account, 1 = identity, 2 = profile. Drives the badge and rail. */
const PHASE_BY_STEP: Record<Step, number> = {
  phone: 0,
  otp: 0,
  email: 0,
  kycUpload: 1,
  kycStatus: 1,
  providerPrompt: 2,
  providerProfile: 2,
  done: 2,
};

const PHASE_LABELS = ["Account", "Identity", "Profile"];

export function OnboardingPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [kycStatus, setKycStatus] = useState<KycStatus>("pending");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhoneSubmit = async (fullPhone: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await requestOtp(fullPhone);
      setPhone(fullPhone);
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
      const result = await verifyOtp(phone, code);
      // Token is persisted by verifyOtp(). Skip straight past the email step
      // for a returning user who already has one on file.
      setStep(result.user.email ? "kycUpload" : "email");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "That code didn't work. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await requestOtp(phone);
    } finally {
      setIsResending(false);
    }
  };

  const handleEmailSubmit = async (email: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await updateProfile({ email });
      setStep("kycUpload");
    } catch (emailError) {
      setError(emailError instanceof Error ? emailError.message : "We couldn't save that email. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKycSubmit = async (idDocument: File, selfie: File) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await submitKyc(idDocument, selfie);
      setKycStatus(result.kycStatus);
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
      await updateProfile({ role: "provider" });
      await createProviderProfile(payload);
      setStep("done");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "We couldn't create your profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const phase = PHASE_BY_STEP[step];

  const kycCopy: Record<KycStatus, { title: string; subtitle: string }> = {
    verified: { title: "You're verified", subtitle: "Your documents are on file and your account is ready to use." },
    manual_review: { title: "Documents received", subtitle: "We're reviewing your ID and selfie. This usually only takes a moment." },
    pending: { title: "Documents received", subtitle: "We're reviewing your ID and selfie. This usually only takes a moment." },
    rejected: { title: "We couldn't verify those", subtitle: "Your ID or selfie wasn't clear enough to read. Please upload them again." },
  };

  const copy: Record<Step, { title: string; subtitle: string }> = {
    phone: {
      title: "Let's get you started",
      subtitle: "Enter your mobile number and we'll text you a code to verify it.",
    },
    otp: {
      title: "Check your messages",
      subtitle: `We sent a 6-digit code to ${phone}. Enter it below to continue.`,
    },
    email: {
      title: "Where do receipts go?",
      subtitle: "We need an email address to send you receipts when you pay for a booking.",
    },
    kycUpload: {
      title: "Verify your identity",
      subtitle: "Add a government-issued ID and a selfie. This is what keeps Zeyla trusted for everyone.",
    },
    kycStatus: kycCopy[kycStatus],
    providerPrompt: {
      title: "Want to offer services?",
      subtitle: "Set up a provider profile to start receiving job requests, or skip and do it later.",
    },
    providerProfile: {
      title: "Set up your profile",
      subtitle: "Tell customers what you do, where you work, and what you charge.",
    },
    done: {
      title: "You're all set",
      subtitle: "You can now find trusted providers nearby and pay safely through escrow.",
    },
  };

  return (
    <main className="onboarding">
      <nav className="onboarding__nav">
        {step === "otp" && (
          <button className="onboarding__nav-action" type="button" onClick={() => setStep("phone")}>
            ‹ Back
          </button>
        )}
        {step === "providerProfile" && (
          <button className="onboarding__nav-action" type="button" onClick={() => setStep("providerPrompt")}>
            ‹ Back
          </button>
        )}
        <span className="onboarding__brand">
          <span className="onboarding__logo">Z</span>
          <span className="onboarding__wordmark">Zeyla</span>
        </span>
      </nav>

      <header className="onboarding__hero">
        <div className="onboarding__badges">
          <span className="onboarding__badge">{PHASE_LABELS[phase]}</span>
          <span className="onboarding__badge onboarding__badge--ghost">Step {phase + 1} of 3</span>
        </div>
        <h1 className="onboarding__title">{copy[step].title}</h1>
        <p className="onboarding__subtitle">{copy[step].subtitle}</p>
        <div
          className="onboarding__rail"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={phase + 1}
          aria-label="Onboarding progress"
        >
          {[0, 1, 2].map((segment) => (
            <span key={segment} className={segment <= phase ? "is-filled" : ""} />
          ))}
        </div>
      </header>

      <section className="onboarding__card">
        {step === "phone" && <PhoneStep isSubmitting={isSubmitting} onSubmit={handlePhoneSubmit} />}

        {step === "otp" && (
          <OtpStep
            isSubmitting={isSubmitting}
            isResending={isResending}
            error={error}
            onSubmit={handleOtpSubmit}
            onResend={handleResend}
          />
        )}

        {step === "email" && (
          <EmailStep isSubmitting={isSubmitting} error={error} onSubmit={handleEmailSubmit} onSkip={() => setStep("kycUpload")} />
        )}

        {step === "kycUpload" && <KycUploadStep isSubmitting={isSubmitting} error={error} onSubmit={handleKycSubmit} />}

        {step === "kycStatus" && (
          <KycStatusScreen status={kycStatus} onResubmit={() => setStep("kycUpload")} onContinue={() => setStep("providerPrompt")} />
        )}

        {step === "providerPrompt" && (
          <div className="onboarding__form">
            <button className="onboarding__button" type="button" onClick={() => setStep("providerProfile")}>
              Set up provider profile
            </button>
            <button className="onboarding__button onboarding__button--secondary" type="button" onClick={() => setStep("done")}>
              Not now
            </button>
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
            </div>
            <a className="onboarding__button" href="/discovery">
              Find services near you
            </a>
          </div>
        )}
      </section>

      <p className="onboarding__footnote">Encrypted · Escrow protected · Addis Ababa</p>
    </main>
  );
}
