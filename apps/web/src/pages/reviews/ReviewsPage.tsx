import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getTrustBreakdown,
  submitFlag,
  submitRating,
  transcribeText,
} from "../discovery/lib/api.js";
import { MOCK_PROVIDERS } from "../discovery/lib/mockData.js";
import type { TrustBreakdown } from "../discovery/lib/types.js";
import { LanguageProvider, useLanguage } from "../discovery/lib/language.js";
import { FlagPanel } from "./components/FlagPanel.js";
import { ReviewForm } from "./components/ReviewForm.js";
import { ReviewSuccess } from "./components/ReviewSuccess.js";
import { ReviewsNav } from "./components/ReviewsNav.js";
import { TrustPanel } from "./components/TrustPanel.js";
import { AnimatedMeshBg } from "../discovery/components/AnimatedMeshBg.js";
import "../discovery/discovery.css";
import "./reviews.css";

function ReviewsContent() {
  const [params] = useSearchParams();
  const requestId = Number(params.get("requestId") ?? "100");
  const providerId = Number(params.get("providerId") ?? "1");
  const { lang } = useLanguage();

  const provider = MOCK_PROVIDERS.find((p) => p.id === providerId);

  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [breakdown, setBreakdown] = useState<TrustBreakdown | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [showFlag, setShowFlag] = useState(false);

  const trackingUrl = `/tracking?requestId=${requestId}&providerId=${providerId}`;

  useEffect(() => {
    getTrustBreakdown(providerId).then(setBreakdown).catch(() => {});
  }, [providerId]);

  function toggleTag(id: string) {
    setTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  async function handleVoiceReview() {
    setRecording(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.start();
      await new Promise((r) => setTimeout(r, 6000));
      recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      await new Promise((r) => {
        recorder.onstop = r;
      });
      const blob = new Blob(chunks, { type: "audio/webm" });
      const text = await transcribeText(blob, lang);
      setComment((c) => (c ? `${c} ${text}` : text));
    } catch {
      setError("Voice recording failed. Type your review instead.");
    } finally {
      setRecording(false);
    }
  }

  async function handleSubmitReview() {
    if (stars < 1) {
      setError("Please select a star rating.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitRating({
        request_id: requestId,
        provider_id: providerId,
        stars,
        tags,
        comment: comment.trim() || undefined,
      });
      setSubmitted(true);
    } catch {
      setError("Could not submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFlag() {
    if (!flagReason) {
      setError("Please select a reason for flagging.");
      return;
    }
    setFlagging(true);
    setError(null);
    try {
      await submitFlag({ target_user_id: providerId, reason: flagReason });
      setFlagged(true);
    } catch {
      setError("Could not submit flag. Please try again.");
    } finally {
      setFlagging(false);
    }
  }

  if (submitted) {
    return <ReviewSuccess />;
  }

  return (
    <div className="reviews-root">
      <AnimatedMeshBg />
      <div className="rv-page z-page-enter-stagger">
        <ReviewsNav backTo={trackingUrl} />

        <header className="rv-hero">
          <div className="rv-badges">
            <span className="rv-badge-dark">Job completed</span>
            <span className="rv-badge-light">Rate provider ›</span>
          </div>
          <h1>How was your experience?</h1>
          <p>
            Your feedback updates trust scores and helps others find reliable
            providers in Addis Ababa.
          </p>
          <div className="rv-request-pill">
            Request <strong>#{requestId}</strong>
            {provider && (
              <>
                <span aria-hidden="true">·</span>
                <strong>{provider.name}</strong>
              </>
            )}
          </div>
        </header>

        {error && <div className="z-error">{error}</div>}

        <div className="rv-grid">
          <div className="rv-main-card">
            <ReviewForm
              stars={stars}
              tags={tags}
              comment={comment}
              recording={recording}
              submitting={submitting}
              onStarsChange={setStars}
              onToggleTag={toggleTag}
              onCommentChange={setComment}
              onVoice={handleVoiceReview}
              onSubmit={handleSubmitReview}
            />
          </div>

          <aside className="rv-sidebar">
            {breakdown && (
              <TrustPanel
                breakdown={breakdown}
                providerName={provider?.name}
              />
            )}
            <FlagPanel
              show={showFlag}
              flagged={flagged}
              flagReason={flagReason}
              flagging={flagging}
              onToggle={() => setShowFlag(true)}
              onCancel={() => setShowFlag(false)}
              onReasonChange={setFlagReason}
              onSubmit={handleFlag}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

export function ReviewsPage() {
  return (
    <LanguageProvider>
      <ReviewsContent />
    </LanguageProvider>
  );
}
