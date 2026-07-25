import { ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useCountdown } from "../useCountdown";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

type OtpStepProps = {
  phone: string;
  isSubmitting: boolean;
  isResending: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
};

export function OtpStep({ phone, isSubmitting, isResending, error, onSubmit, onResend, onChangeNumber }: OtpStepProps) {
  const [values, setValues] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const { remaining, restart } = useCountdown(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    restart();
    inputsRef.current[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDigit = (index: number, digit: string) => {
    setValues((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
  };

  const handleChange = (index: number, rawValue: string) => {
    const digit = rawValue.replace(/\D/g, "").slice(-1);
    setDigit(index, digit);
    if (digit && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
    const nextValues = [...values];
    nextValues[index] = digit;
    if (nextValues.every(Boolean)) onSubmit(nextValues.join(""));
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !values[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(CODE_LENGTH).fill("");
    pasted.split("").forEach((digit, index) => (next[index] = digit));
    setValues(next);
    const lastFilled = Math.min(pasted.length, CODE_LENGTH) - 1;
    inputsRef.current[lastFilled]?.focus();
    if (pasted.length === CODE_LENGTH) onSubmit(pasted);
  };

  const handleResend = () => {
    onResend();
    restart();
    setValues(Array(CODE_LENGTH).fill(""));
    inputsRef.current[0]?.focus();
  };

  return (
    <div className="onboarding__form">
      <p className="onboarding__hint">Enter the 6-digit code sent to {phone}.</p>
      <div className="onboarding__otp" onPaste={handlePaste}>
        {values.map((value, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            className="onboarding__otp-box"
            inputMode="numeric"
            maxLength={1}
            value={value}
            disabled={isSubmitting}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>
      {error && (
        <p className="onboarding__notice onboarding__notice--error" role="alert">
          {error}
        </p>
      )}
      <div className="onboarding__actions">
        <button
          className="onboarding__button onboarding__button--secondary"
          type="button"
          disabled={remaining > 0 || isResending}
          onClick={handleResend}
        >
          {isResending ? "Resending…" : remaining > 0 ? `Resend code in ${remaining}s` : "Resend code"}
        </button>
        <button className="onboarding__button onboarding__button--secondary" type="button" onClick={onChangeNumber}>
          Change number
        </button>
      </div>
    </div>
  );
}
