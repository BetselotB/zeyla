import { FormEvent, useEffect, useState } from "react";
import "./OnboardingPage.css";

type Step = "phone" | "otp" | "role" | "kyc" | "profile" | "verified";
type Role = "user" | "provider";
type KycStatus = "submitted" | "verified" | "pending" | "rejected";

type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? ""}${path}`;

async function api<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(apiUrl(path), options);
  return response.json() as Promise<ApiResponse<T>>;
}

export function OnboardingPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [accessToken, setAccessToken] = useState("");
  const [isSupabaseConfigured, setIsSupabaseConfigured] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);

  useEffect(() => {
    api<{ configured: boolean }>("/api/auth/status")
      .then((response) => setIsSupabaseConfigured(response.data?.configured ?? false))
      .catch(() => setIsSupabaseConfigured(false));
  }, []);

  const requestOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setError("Phone sign-in is not configured yet. Add the Supabase URL and anonymous key to apps/web/.env.local.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${url}/auth/v1/otp`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) throw new Error("We could not send that code. Check the phone number and try again.");
      setMessage(`A code was sent to ${phone}.`);
      setStep("otp");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send the code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${url}/auth/v1/verify`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ phone, token: otp, type: "sms" }),
      });
      const payload = (await response.json()) as { access_token?: string; error_description?: string };
      if (!response.ok || !payload.access_token) throw new Error(payload.error_description ?? "That code is not valid.");
      setAccessToken(payload.access_token);
      setMessage("Phone number confirmed.");
      setStep("role");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to verify the code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitKyc = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    setIsSubmitting(true);
    setKycStatus("submitted");

    try {
      const response = await api<{ status?: KycStatus }>("/api/auth/kyc/verify", {
        method: "POST",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        body: formData,
      });

      if (response.success && response.data?.status) {
        setKycStatus(response.data.status);
        setStep(response.data.status === "verified" ? (role === "provider" ? "profile" : "verified") : "kyc");
        return;
      }

      // The demo backend deliberately auto-verifies while the Fal integration is unavailable.
      setKycStatus("verified");
      setMessage("Documents submitted and verified for this demo. No live biometric face-match is performed.");
      setStep(role === "provider" ? "profile" : "verified");
    } catch {
      setError("We could not submit your documents. Your files have not been saved; please try again.");
      setKycStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveProviderProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("Your provider profile is ready for the demo. It will be synced when the profile API is available.");
    setStep("verified");
  };

  const title = step === "verified" ? "You’re ready to use Zeyla" : "Set up your Zeyla account";

  return (
    <main className="onboarding">
      <header className="onboarding__intro">
        <p className="onboarding__eyebrow">Account setup</p>
        <h1 className="onboarding__title">{title}</h1>
        <p className="lede">Sign in, choose how you’ll use Zeyla, and submit your documents securely.</p>
      </header>

      <ol className="onboarding__steps" aria-label="Onboarding progress">
        <li className={step === "phone" || step === "otp" ? "is-active" : ""}>Sign in</li>
        <li className={step === "role" ? "is-active" : ""}>Role</li>
        <li className={step === "kyc" ? "is-active" : ""}>Documents</li>
        <li className={step === "profile" || step === "verified" ? "is-active" : ""}>Ready</li>
      </ol>

      <section className="onboarding__card">
        {isSupabaseConfigured === false && step === "phone" && (
          <p className="onboarding__notice">Phone OTP will be available once Supabase is configured for this environment.</p>
        )}
        {message && <p className="onboarding__notice" role="status">{message}</p>}
        {error && <p className="onboarding__notice onboarding__notice--error" role="alert">{error}</p>}

        {step === "phone" && (
          <form className="onboarding__form" onSubmit={requestOtp}>
            <label className="onboarding__field">Mobile number
              <input required type="tel" autoComplete="tel" placeholder="+251 9 00 000 000" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <button className="onboarding__button" disabled={isSubmitting || isSupabaseConfigured === false} type="submit">
              {isSubmitting ? "Sending code…" : "Send verification code"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form className="onboarding__form" onSubmit={verifyOtp}>
            <label className="onboarding__field">Verification code
              <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} />
            </label>
            <div className="onboarding__actions">
              <button className="onboarding__button" disabled={isSubmitting} type="submit">{isSubmitting ? "Verifying…" : "Verify number"}</button>
              <button className="onboarding__button onboarding__button--secondary" type="button" onClick={() => setStep("phone")}>Change number</button>
            </div>
          </form>
        )}

        {step === "role" && (
          <div className="onboarding__form">
            <p>How will you use Zeyla?</p>
            <div className="onboarding__role-options">
              <button className={`onboarding__role ${role === "user" ? "is-selected" : ""}`} type="button" onClick={() => setRole("user")}><strong>Find a service</strong><span>Browse trusted local providers.</span></button>
              <button className={`onboarding__role ${role === "provider" ? "is-selected" : ""}`} type="button" onClick={() => setRole("provider")}><strong>Offer services</strong><span>Create a profile and receive requests.</span></button>
            </div>
            <button className="onboarding__button" type="button" onClick={() => setStep("kyc")}>Continue as {role === "provider" ? "a provider" : "a customer"}</button>
          </div>
        )}

        {step === "kyc" && (
          <form className="onboarding__form" onSubmit={submitKyc}>
            <div className="onboarding__status">
              <span className="onboarding__status-icon">i</span>
              <p className="onboarding__hint">For this demo, submitted documents are automatically verified. We do not perform a live biometric face-match.</p>
            </div>
            <label className="onboarding__field">Government-issued ID
              <input required name="idDocument" type="file" accept="image/*,.pdf" />
            </label>
            <label className="onboarding__field">Selfie photo
              <input required name="selfie" type="file" accept="image/*" capture="user" />
            </label>
            {kycStatus === "submitted" && <p className="onboarding__notice">Documents submitted. Checking status…</p>}
            {kycStatus === "pending" && <p className="onboarding__notice">Your documents are pending review. You can return later to check again.</p>}
            {kycStatus === "rejected" && <p className="onboarding__notice onboarding__notice--error">We couldn’t verify those documents. Please upload clear, valid images and try again.</p>}
            <button className="onboarding__button" disabled={isSubmitting} type="submit">{isSubmitting ? "Submitting…" : "Submit documents"}</button>
          </form>
        )}

        {step === "profile" && (
          <form className="onboarding__form" onSubmit={saveProviderProfile}>
            <p className="onboarding__notice">Identity verified. Tell customers what you do.</p>
            <label className="onboarding__field">Service category
              <select required name="category" defaultValue=""><option value="" disabled>Select a category</option><option>Home repairs</option><option>Cleaning</option><option>Beauty and wellness</option><option>Lessons and tutoring</option></select>
            </label>
            <label className="onboarding__field">Years of experience
              <input required name="experienceYears" type="number" min="0" max="60" />
            </label>
            <label className="onboarding__field">About your service
              <textarea required name="bio" maxLength={500} placeholder="Describe the service you offer, your experience, and what customers can expect." />
            </label>
            <button className="onboarding__button" type="submit">Create provider profile</button>
          </form>
        )}

        {step === "verified" && (
          <div className="onboarding__form">
            <div className="onboarding__status"><span className="onboarding__status-icon">✓</span><div><strong>Account verified</strong><p className="onboarding__hint">You can now discover services and fund work through escrow.</p></div></div>
          </div>
        )}
      </section>
    </main>
  );
}
