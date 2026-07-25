import { FormEvent, useState } from "react";

const NINE_DIGITS = /^[97]\d{8}$/;

type PhoneStepProps = {
  isSubmitting: boolean;
  onSubmit: (fullPhone: string) => void;
};

/** Ethiopian mobile entry: fixed +251 prefix, exactly 9 digits, starting 9 or 7. */
export function PhoneStep({ isSubmitting, onSubmit }: PhoneStepProps) {
  const [digits, setDigits] = useState("");
  const [touched, setTouched] = useState(false);

  const isValid = NINE_DIGITS.test(digits);

  const handleChange = (value: string) => {
    setDigits(value.replace(/\D/g, "").slice(0, 9));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!isValid) return;
    onSubmit(`+251${digits}`);
  };

  return (
    <form className="onboarding__form" onSubmit={handleSubmit}>
      <label className="onboarding__field">
        Mobile number
        <div className="onboarding__phone-input">
          <span className="onboarding__phone-prefix">+251</span>
          <input
            required
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="9 12 345 678"
            value={digits}
            onChange={(event) => handleChange(event.target.value)}
          />
        </div>
        {touched && !isValid && (
          <span className="onboarding__field-error">Enter 9 digits, starting with 9 or 7.</span>
        )}
      </label>
      <button className="onboarding__button" disabled={isSubmitting || !isValid} type="submit">
        {isSubmitting ? "Sending code…" : "Send verification code"}
      </button>
    </form>
  );
}
