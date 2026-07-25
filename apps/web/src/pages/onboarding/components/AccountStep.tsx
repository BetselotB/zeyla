import { useState, type FormEvent } from "react";
import "../../../auth/auth.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type AccountStepProps = {
  /** False when the Supabase keys are missing — phone OTP is then the only way in. */
  supabaseEnabled: boolean;
  onGoogle: () => Promise<void>;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  onUsePhone: () => void;
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * First screen of onboarding: Google, email + password, or phone OTP.
 *
 * Google and password go through Supabase in the browser, so no credential
 * ever reaches the Zeyla API — it only verifies the token that comes back.
 * Phone OTP is served by our own API and lives on the next screen.
 */
export function AccountStep({
  supabaseEnabled,
  onGoogle,
  onSignIn,
  onSignUp,
  onUsePhone,
}: AccountStepProps) {
  const [mode, setMode] = useState<"signIn" | "signUp">("signUp");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const emailValid = EMAIL_PATTERN.test(email.trim());
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = emailValid && passwordValid && busy === null;

  const handleGoogle = async () => {
    setError(null);
    setBusy("google");
    try {
      await onGoogle();
      // A successful call navigates to Google, so this only resolves on failure
      // or when the popup-blocked path returns.
    } catch (googleError) {
      setError(
        googleError instanceof Error ? googleError.message : "Google sign-in failed.",
      );
      setBusy(null);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setBusy("password");
    try {
      if (mode === "signIn") {
        await onSignIn(email.trim(), password);
      } else {
        const { needsEmailConfirmation } = await onSignUp(
          email.trim(),
          password,
          name.trim(),
        );
        if (needsEmailConfirmation) setConfirmationSentTo(email.trim());
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "That didn't work. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (confirmationSentTo) {
    return (
      <div className="onboarding__form">
        <div className="onboarding__status">
          <span className="onboarding__status-icon">✓</span>
        </div>
        <p className="onboarding__hint">
          Confirm your address to continue — we sent a link to{" "}
          <strong>{confirmationSentTo}</strong>. Come back here once you've clicked it.
        </p>
        <button
          className="onboarding__button onboarding__button--secondary"
          type="button"
          onClick={() => {
            setConfirmationSentTo(null);
            setMode("signIn");
          }}
        >
          I've confirmed — sign me in
        </button>
      </div>
    );
  }

  return (
    <div className="auth-methods">
      {supabaseEnabled && (
        <>
          <button
            className="auth-methods__oauth"
            type="button"
            disabled={busy !== null}
            onClick={handleGoogle}
          >
            <GoogleMark />
            {busy === "google" ? "Opening Google…" : "Continue with Google"}
          </button>

          <div className="auth-methods__divider">or</div>

          <div className="auth-tabs" role="group" aria-label="Email sign-in mode">
            <button
              type="button"
              aria-pressed={mode === "signUp"}
              onClick={() => {
                setMode("signUp");
                setError(null);
              }}
            >
              Create account
            </button>
            <button
              type="button"
              aria-pressed={mode === "signIn"}
              onClick={() => {
                setMode("signIn");
                setError(null);
              }}
            >
              Sign in
            </button>
          </div>

          <form className="onboarding__form" onSubmit={handleSubmit}>
            {mode === "signUp" && (
              <label className="onboarding__field">
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Abebe Bekele"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}

            <label className="onboarding__field">
              Email address
              <input
                required
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className="onboarding__field">
              Password
              <input
                required
                type="password"
                autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {password.length > 0 && !passwordValid && (
                <span className="onboarding__field-error">
                  Use at least {MIN_PASSWORD_LENGTH} characters.
                </span>
              )}
            </label>

            {error && (
              <p className="onboarding__notice onboarding__notice--error" role="alert">
                {error}
              </p>
            )}

            <button className="onboarding__button" type="submit" disabled={!canSubmit}>
              {busy === "password"
                ? "Just a moment…"
                : mode === "signUp"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        </>
      )}

      {!supabaseEnabled && (
        <p className="onboarding__hint">
          Email and Google sign-in aren't configured on this build. Continue with your
          phone number instead.
        </p>
      )}

      <button className="auth-methods__alt" type="button" onClick={onUsePhone}>
        Use my phone number instead
      </button>
    </div>
  );
}
