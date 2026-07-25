const FLAG_REASONS = [
  "No-show or late arrival",
  "Unprofessional behavior",
  "Overcharged or hidden fees",
  "Poor quality work",
  "Safety concern",
];

interface FlagPanelProps {
  show: boolean;
  flagged: boolean;
  flagReason: string;
  flagging: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
}

export function FlagPanel({
  show,
  flagged,
  flagReason,
  flagging,
  onToggle,
  onCancel,
  onReasonChange,
  onSubmit,
}: FlagPanelProps) {
  if (flagged) {
    return (
      <section className="rv-flag-panel rv-flag-done">
        <div className="rv-flag-done-icon" aria-hidden="true">✓</div>
        <p>Report submitted. Our team will review it shortly.</p>
      </section>
    );
  }

  if (!show) {
    return (
      <section className="rv-flag-panel rv-flag-collapsed">
        <p className="rv-flag-hint">Something went wrong?</p>
        <button type="button" className="rv-flag-trigger" onClick={onToggle}>
          Report an issue
        </button>
      </section>
    );
  }

  return (
    <section className="rv-flag-panel">
      <div className="rv-flag-header">
        <p className="rv-section-label">Report a problem</p>
        <button type="button" className="rv-flag-close" onClick={onCancel} aria-label="Close">
          ×
        </button>
      </div>
      <div className="rv-flag-options">
        {FLAG_REASONS.map((reason) => (
          <label
            key={reason}
            className={`rv-flag-option${flagReason === reason ? " selected" : ""}`}
          >
            <input
              type="radio"
              name="flag-reason"
              value={reason}
              checked={flagReason === reason}
              onChange={() => onReasonChange(reason)}
            />
            <span>{reason}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="z-btn z-btn-primary rv-flag-submit"
        onClick={onSubmit}
        disabled={flagging || !flagReason}
      >
        {flagging ? "Submitting…" : "Submit report"}
      </button>
    </section>
  );
}

export { FLAG_REASONS };
