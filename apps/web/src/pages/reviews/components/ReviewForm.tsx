import { StarRating } from "./StarRating.js";

function MicIcon() {
  return (
    <svg className="z-selector-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="5.5" y="2" width="5" height="7" rx="2.5" />
      <path d="M3 8a5 5 0 0010 0M8 13v2" />
    </svg>
  );
}

interface ReviewFormProps {
  stars: number;
  tags: string[];
  comment: string;
  recording: boolean;
  submitting: boolean;
  onStarsChange: (n: number) => void;
  onToggleTag: (id: string) => void;
  onCommentChange: (text: string) => void;
  onVoice: () => void;
  onSubmit: () => void;
}

const QUICK_TAGS = [
  { id: "on_time", label: "On time", emoji: "⏱" },
  { id: "professional", label: "Professional", emoji: "✦" },
  { id: "would_recommend", label: "Would recommend", emoji: "♥" },
];

export function ReviewForm({
  stars,
  tags,
  comment,
  recording,
  submitting,
  onStarsChange,
  onToggleTag,
  onCommentChange,
  onVoice,
  onSubmit,
}: ReviewFormProps) {
  return (
    <div className="z-glass-inner rv-form-inner">
      <StarRating value={stars} onChange={onStarsChange} />

      <div className="rv-divider" />

      <p className="rv-section-label">Quick tags</p>
      <div className="rv-tags">
        {QUICK_TAGS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rv-tag${tags.includes(t.id) ? " selected" : ""}`}
            onClick={() => onToggleTag(t.id)}
          >
            <span aria-hidden="true">{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rv-divider" />

      <p className="rv-section-label">Your review</p>
      <textarea
        className="z-textarea rv-textarea"
        placeholder="Share more about your experience — what went well, what could improve…"
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        rows={4}
      />

      <div className="rv-voice-row">
        <button
          type="button"
          className={`z-selector z-mic-btn rv-voice-btn${recording ? " recording" : ""}`}
          onClick={onVoice}
          disabled={recording}
        >
          <MicIcon />
          {recording ? "Recording…" : "Voice review"}
        </button>
        <span className="rv-voice-hint">6 sec · Whisperflow</span>
      </div>

      <div className="rv-submit-row">
        <button
          type="button"
          className="z-btn z-btn-primary"
          onClick={onSubmit}
          disabled={submitting || stars < 1}
        >
          {submitting ? "Submitting…" : "Submit review"}
          {!submitting && (
            <span className="z-btn-arrow" aria-hidden="true">
              <svg viewBox="0 0 12 12" strokeWidth="2">
                <path d="M6 9V3M6 3L3 6M6 3L9 6" />
              </svg>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export { QUICK_TAGS };
