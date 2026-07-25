const STEPS = [
  { key: "sent", label: "Request sent", desc: "Waiting for provider to respond" },
  { key: "accepted", label: "Accepted", desc: "Provider is heading your way" },
  { key: "completed", label: "Completed", desc: "Job done — time to review" },
] as const;

interface StatusTimelineProps {
  currentStep: number;
  isDeclined: boolean;
}

export function StatusTimeline({ currentStep, isDeclined }: StatusTimelineProps) {
  return (
    <section className="tr-timeline-card">
      <p className="tr-section-label">Status</p>
      <ol className="tr-timeline">
        {STEPS.map((step, i) => {
          let state: "done" | "active" | "pending" | "declined" = "pending";
          if (isDeclined && i === 1) state = "declined";
          else if (i < currentStep) state = "done";
          else if (i === currentStep) state = "active";

          return (
            <li key={step.key} className={`tr-step tr-step-${state}`}>
              <span className="tr-step-marker">
                {state === "done" ? (
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                ) : state === "declined" ? (
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l6 6M9 3L3 9" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </span>
              <div className="tr-step-body">
                <p className="tr-step-label">
                  {isDeclined && i === 1 ? "Declined" : step.label}
                </p>
                <p className="tr-step-desc">
                  {isDeclined && i === 1
                    ? "Try another provider nearby"
                    : step.desc}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
