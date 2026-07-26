import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AuthUser, KycStatus, ProviderProfileInput, UserRole } from "@zeyla/shared";
import { AuthSplash } from "../../auth/AuthSplash";
import { useAuth } from "../../auth/AuthProvider";
import { VerifiedBadge } from "../../auth/VerifiedBadge";
// Shared page chrome lives with discovery (owner: Daniel). Imported, not copied,
// so onboarding cannot drift away from the landing layout.
import { AnimatedMeshBg } from "../discovery/components/AnimatedMeshBg.js";
import { DiscoveryNav } from "../discovery/components/DiscoveryNav.js";
import "../discovery/discovery.css";
import { createProviderProfile, requestOtp, submitKyc, updateProfile, verifyOtp } from "./api";
import { AccountStep } from "./components/AccountStep";
import { EmailStep } from "./components/EmailStep";
import { KycStatusScreen } from "./components/KycStatusScreen";
import { KycUploadStep } from "./components/KycUploadStep";
import { OtpStep } from "./components/OtpStep";
import { PhoneStep } from "./components/PhoneStep";
import { ProviderProfileForm } from "./components/ProviderProfileForm";
import { RoleStep } from "./components/RoleStep";
import "./OnboardingPage.css";

type Step =
  | "account"
  | "phone"
  | "otp"
  | "email"
  | "kycUpload"
  | "kycStatus"
  | "role"
  | "providerProfile"
  | "done";

/** Phase 0 = account, 1 = identity, 2 = profile. Drives the badge and rail. */
const PHASE_BY_STEP: Record<Step, number> = {
  account: 0,
  phone: 0,
  otp: 0,
  email: 0,
  kycUpload: 1,
  kycStatus: 1,
  role: 2,
  providerProfile: 2,
  done: 2,
};

const PHASE_LABELS = ["Account", "Identity", "Profile"];

/**
 * Where a half-finished account picks back up.
 *
 * Identity verification is not optional — the route guard keeps everyone here
 * until KYC clears — so the only steps that can be skipped are the email (which
 * Google and password signups already have) and the provider profile.
 */
function resumeStep(user: AuthUser): Step {
  // Chapa rejects a checkout with no receipt address, so an account that came
  // in by phone has to supply one before it can pay for anything.
  if (!user.email) return "email";
  if (user.kycStatus === "verified") return "role";
  if (user.kycStatus === "manual_review") return "kycStatus";
  return "kycUpload";
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    status,
    user,
    supabaseEnabled,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    adoptApiSession,
    finishOnboarding,
    refresh,
    signOut,
  } = useAuth();

  const [step, setStep] = useState<Step>("account");
  const [phone, setPhone] = useState("");
  const [kycStatus, setKycStatus] = useState<KycStatus>("pending");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Which account we have already positioned the flow for. */
  const resumedFor = useRef<string | null>(null);

  // Whoever sent us here — the route guard passes the page it blocked, so
  // finishing signup returns the user to what they were actually after.
  // Failing that, each role gets its own home: a provider's is the availability
  // switch, because until they turn it on nothing else in the app does anything
  // for them.
  const isProvider = user?.role === "provider";
  const destination =
    (location.state as { from?: string } | null)?.from ??
    (isProvider ? "/provider" : "/discovery");

  useEffect(() => {
    if (status === "loading") return;

    if (status === "anonymous") {
      resumedFor.current = null;
      // Don't yank someone out of the phone screens they deliberately opened.
      setStep((current) => (current === "phone" || current === "otp" ? current : "account"));
      return;
    }

    if (!user || resumedFor.current === user.id) return;
    resumedFor.current = user.id;

    if (user.onboardingCompleted) {
      navigate(destination, { replace: true });
      return;
    }

    setKycStatus(user.kycStatus);
    setStep(resumeStep(user));
  }, [destination, navigate, status, user]);

  const goToDone = useCallback(async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await finishOnboarding();
      setStep("done");
    } catch (finishError) {
      setError(
        finishError instanceof Error
          ? finishError.message
          : "We couldn't finish setting up your account. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [finishOnboarding]);

  /**
   * "Customer" is the absence of a provider profile rather than a role write of
   * its own — the API promotes an account to `provider` when the profile is
   * created, so choosing customer just finishes onboarding.
   */
  const handleRoleContinue = (role: UserRole) => {
    if (role === "provider") {
      setStep("providerProfile");
      return;
    }
    void goToDone();
  };

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
      // Adopting the token makes the whole app aware of the sign-in; the resume
      // effect above then picks the right next step.
      await adoptApiSession(result.token);
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
      await refresh();
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
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We couldn't submit your documents. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProviderProfileSubmit = async (payload: ProviderProfileInput) => {
    setError(null);
    setIsSubmitting(true);
    try {
      // Promotes the account to the provider role server-side, in the same
      // transaction as the profile.
      await createProviderProfile(payload);
      await refresh();
      await goToDone();
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "We couldn't create your profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return <AuthSplash label="Checking your session…" />;
  }

  const phase = PHASE_BY_STEP[step];

  const kycCopy: Record<KycStatus, { title: string; subtitle: string }> = {
    verified: { title: "You're verified", subtitle: "Your documents are on file and your account is ready to use." },
    manual_review: { title: "Documents received", subtitle: "We're reviewing your ID and selfie. This usually only takes a moment." },
    pending: { title: "Documents received", subtitle: "We're reviewing your ID and selfie. This usually only takes a moment." },
    rejected: { title: "We couldn't verify those", subtitle: "Your ID or selfie wasn't clear enough to read. Please upload them again." },
  };

  const copy: Record<Step, { title: string; subtitle: string }> = {
    account: {
      title: "Let's get you started",
      subtitle: "Continue with Google, sign up with an email and password, or use your phone number.",
    },
    phone: {
      title: "What's your number?",
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
    role: {
      title: "How will you use Zeyla?",
      subtitle: "Pick the one that fits you today — you can add the other later.",
    },
    providerProfile: {
      title: "Set up your profile",
      subtitle: "Tell customers what you do, where you work, and what you charge.",
    },
    done: {
      title: "You're all set",
      subtitle: isProvider
        ? "Your profile is live. Turn on availability whenever you're ready and jobs nearby will come to you."
        : "You can now find trusted providers nearby and pay safely through escrow.",
    },
  };

  const backStep: Step | null =
    step === "otp"
      ? "phone"
      : step === "phone"
        ? "account"
        : step === "providerProfile"
          ? "role"
          : null;

  return (
    <div className="discovery-root">
      <AnimatedMeshBg />
      <div className="z-page z-page-enter-stagger onboarding">
        <DiscoveryNav />

        <section className="z-hero">
          <div className="z-badges">
            <span className="z-badge z-badge-dark">{PHASE_LABELS[phase]}</span>
            <span className="z-badge z-badge-light">Step {phase + 1} of 3</span>
          </div>
          <h1>{copy[step].title}</h1>
          <p>{copy[step].subtitle}</p>
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
        </section>

        <div className="z-glass-card">
          <div className="z-glass-inner onboarding__card">
            {backStep && (
              <button
                className="onboarding__nav-action"
                type="button"
                onClick={() => setStep(backStep)}
              >
                ‹ Back
              </button>
            )}

        {step === "account" && (
          <AccountStep
            supabaseEnabled={supabaseEnabled}
            onGoogle={signInWithGoogle}
            onSignIn={signInWithPassword}
            onSignUp={signUpWithPassword}
            onUsePhone={() => setStep("phone")}
          />
        )}

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
          <KycStatusScreen status={kycStatus} onResubmit={() => setStep("kycUpload")} onContinue={() => setStep("role")} />
        )}

        {step === "role" && (
          <RoleStep isSubmitting={isSubmitting} error={error} onContinue={handleRoleContinue} />
        )}

        {step === "providerProfile" && (
          <ProviderProfileForm
            isSubmitting={isSubmitting}
            error={error}
            defaults={{ fullName: user?.name, phone: user?.phone }}
            onSubmit={(payload) => void handleProviderProfileSubmit(payload)}
            onSkip={() => void goToDone()}
          />
        )}

        {step === "done" && (
          <div className="onboarding__form">
            <div className="onboarding__status">
              <span className="onboarding__status-icon">✓</span>
              <VerifiedBadge status={user?.kycStatus ?? kycStatus} />
            </div>
            <button
              className="onboarding__button"
              type="button"
              onClick={() => navigate(destination, { replace: true })}
            >
              {isProvider ? "Go to your dashboard" : "Find services near you"}
            </button>
          </div>
        )}
          </div>
        </div>

        {user && step !== "done" && (
          <p className="z-microcopy onboarding__footnote">
            Signed in as {user.email ?? user.phone}
            {" · "}
            <button className="auth-methods__alt" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </p>
        )}

        {!user && (
          <p className="z-microcopy onboarding__footnote">
            Encrypted · Escrow protected · Addis Ababa
          </p>
        )}
      </div>
    </div>
  );
}
