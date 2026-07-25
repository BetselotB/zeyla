import type { Classification } from "../lib/types.js";

interface ClassificationCardProps {
  classification: Classification;
  onEdit: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function ClassificationCard({
  classification,
  onEdit,
  onConfirm,
  loading,
}: ClassificationCardProps) {
  return (
    <section className="z-classification">
      <div className="z-glass-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>AI Classification</h3>
          <span className={`z-urgency z-urgency-${classification.urgency}`}>
            {classification.urgency}
          </span>
        </div>

        <dl>
          <dt>Category</dt>
          <dd style={{ textTransform: "capitalize" }}>
            {classification.service_category}
          </dd>
          <dt>Summary</dt>
          <dd>{classification.summary_en}</dd>
          <dt>Est. cost</dt>
          <dd>
            {classification.estimated_cost_min_etb} –{" "}
            {classification.estimated_cost_max_etb} ETB
          </dd>
          <dt>Language</dt>
          <dd style={{ textTransform: "uppercase" }}>
            {classification.detected_language}
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
