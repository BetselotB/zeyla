import { useState } from "react";
import type { FormEvent } from "react";

type EmailStepProps = {
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (email: string) => void;
  onSkip: () => void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Chapa requires a receipt email with real MX records before it will fund an
 * escrow checkout — accounts here are created from a phone number alone, so
 * this is the natural place to collect one. Skippable: it's only enforced
 * later, at payment time.
 */
export function EmailStep({ isSubmitting, error, onSubmit, onSkip }: EmailStepProps) {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);

  const isValid = EMAIL_PATTERN.test(email.trim());

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!isValid) return;
    onSubmit(email.trim());
  };

  return (
    <form className="onboarding__form" onSubmit={handleSubmit}>
      <label className="onboarding__field">
        <span>Email address</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setTouched(true)}
        />
      </label>
      {touched && !isValid && <p className="onboarding__error">Enter a valid email address.</p>}
      {error && <p className="onboarding__error">{error}</p>}
      <div className="onboarding__actions">
        <button className="onboarding__button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Continue"}
        </button>
        <button className="onboarding__button onboarding__button--secondary" type="button" onClick={onSkip} disabled={isSubmitting}>
          Skip for now
        </button>
      </div>
    </form>
  );
}
