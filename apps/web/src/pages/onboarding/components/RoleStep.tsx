import { useState } from "react";
import type { UserRole } from "@zeyla/shared";

type RoleStepProps = {
  isSubmitting: boolean;
  error: string | null;
  onContinue: (role: UserRole) => void;
};

/**
 * Nothing here is irreversible: picking "customer" simply finishes onboarding
 * without a provider profile, and the account can add one later. The copy says
 * so, because a fork this prominent otherwise reads as a permanent account type.
 */
const ROLES: {
  value: UserRole;
  tag: string;
  title: string;
  points: string[];
}[] = [
  {
    value: "user",
    tag: "Customer",
    title: "I need a service",
    points: [
      "Find verified providers near you",
      "Pay into escrow, released when the job is done",
      "Track your provider on the way",
    ],
  },
  {
    value: "provider",
    tag: "Provider",
    title: "I offer services",
    points: [
      "Get job requests from customers nearby",
      "Build a trust score that wins more work",
      "Paid out as soon as the customer confirms",
    ],
  },
];

export function RoleStep({ isSubmitting, error, onContinue }: RoleStepProps) {
  const [role, setRole] = useState<UserRole>("user");

  return (
    <div className="onboarding__form">
      <div
        className="onboarding__roles"
        role="radiogroup"
        aria-label="How will you use Zeyla?"
      >
        {ROLES.map((option) => (
          <label
            key={option.value}
            className={`onboarding__role${role === option.value ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="zeyla-role"
              value={option.value}
              checked={role === option.value}
              onChange={() => setRole(option.value)}
            />
            <span className="onboarding__role-tag">{option.tag}</span>
            <span className="onboarding__role-title">{option.title}</span>
            <ul className="onboarding__role-points">
              {option.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </label>
        ))}
      </div>

      <button
        className="onboarding__button"
        type="button"
        disabled={isSubmitting}
        onClick={() => onContinue(role)}
      >
        {role === "provider" ? "Set up provider profile" : "Start finding services"}
      </button>

      <p className="onboarding__hint">
        You can add a provider profile later from your account either way.
      </p>

      {error && (
        <p className="onboarding__notice onboarding__notice--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
