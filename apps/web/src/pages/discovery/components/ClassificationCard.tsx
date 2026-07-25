import type { VoiceParseResult } from "../lib/types.js";

interface ClassificationCardProps {
  parse: VoiceParseResult;
  /** What the customer said, so they can check the transcription itself. */
  transcript: string;
  onEdit: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  am: "Amharic",
  om: "Afaan Oromo",
};

/** Honest about which stage answered — a keyword guess should not look like AI. */
const SOURCE_LABELS: Record<VoiceParseResult["source"], string> = {
  gemini: "Understood by Gemini",
  addis_ai: "Understood by Addis AI",
  heuristic: "Matched on keywords",
};

export function ClassificationCard({
  parse,
  transcript,
  onEdit,
  onConfirm,
  loading,
}: ClassificationCardProps) {
  const lowConfidence = parse.confidence < 0.6;
  const translated =
    parse.summaryEn !== null &&
    parse.detectedLanguage !== null &&
    parse.detectedLanguage !== "en";

  return (
    <section className="z-classification">
      <div className="z-glass-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>What we understood</h3>
          <span className={`z-urgency z-urgency-${parse.urgency}`}>
            {parse.urgency}
          </span>
        </div>

        {lowConfidence && (
          <p className="z-microcopy" style={{ marginTop: "0.5rem" }}>
            We are not confident about this one — please check the service and
            urgency before continuing.
          </p>
        )}

        <dl>
          <dt>Service</dt>
          <dd style={{ textTransform: "capitalize" }}>
            {parse.category.replace(/_/g, " ")}
          </dd>

          {parse.summaryEn && (
            <>
              <dt>{translated ? "In English" : "Summary"}</dt>
              <dd>{parse.summaryEn}</dd>
            </>
          )}

          {translated && parse.summaryLocal && (
            <>
              <dt>{LANGUAGE_NAMES[parse.detectedLanguage!] ?? "Your words"}</dt>
              <dd lang={parse.detectedLanguage ?? undefined}>{parse.summaryLocal}</dd>
            </>
          )}

          <dt>You said</dt>
          <dd style={{ opacity: 0.75 }}>{transcript}</dd>

          {parse.location.label && (
            <>
              <dt>Area</dt>
              <dd>{parse.location.label}</dd>
            </>
          )}

          {parse.keywords.length > 0 && (
            <>
              <dt>Matching on</dt>
              <dd>{parse.keywords.join(" · ")}</dd>
            </>
          )}

          <dt>Confidence</dt>
          <dd>
            {Math.round(parse.confidence * 100)}% · {SOURCE_LABELS[parse.source]}
          </dd>
        </dl>

        <div className="z-classification-actions">
          <button type="button" className="z-btn z-btn-ghost" onClick={onEdit}>
            Edit description
          </button>
          <button
            type="button"
            className="z-btn z-btn-primary"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Finding providers…" : "Looks right, find providers"}
            {!loading && (
              <span className="z-btn-arrow" aria-hidden="true">
                <svg viewBox="0 0 12 12" strokeWidth="2">
                  <path d="M6 9V3M6 3L3 6M6 3L9 6" />
                </svg>
              </span>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
