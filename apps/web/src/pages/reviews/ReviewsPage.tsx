import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { JobPaymentSummary } from "@zeyla/shared";
import { AppNav } from "../../components/AppNav.js";
import { getContractForRequest } from "../../escrow/api.js";
import { transcribeText } from "../discovery/lib/api.js";
import { LanguageProvider, useLanguage } from "../discovery/lib/language.js";
import { AnimatedMeshBg } from "../discovery/components/AnimatedMeshBg.js";
import {
  getProviderTrust,
  listProviderReviews,
  submitFlag,
  submitReview,
  type TrustView,
} from "./api.js";
import { FlagPanel } from "./components/FlagPanel.js";
import { ReviewForm } from "./components/ReviewForm.js";
import { ReviewSuccess } from "./components/ReviewSuccess.js";
import { TrustPanel } from "./components/TrustPanel.js";
import "../discovery/discovery.css";
import "./reviews.css";

/** Why the review form is not available yet, in the customer's terms. */
function blockedReason(payment: JobPaymentSummary | null): string | null {
  if (!payment) {
    return "This job hasn't been paid for yet, so there's nothing to review. Fund the escrow and come back once the work is finished.";
  }
  if (payment.status === "disputed") {
    return "This job is under review by Zeyla. Reviews open again once the dispute is settled.";
  }
  if (payment.status !== "completed") {
    return "You can leave a review as soon as you've confirmed the job is done and released the payment.";
  }
  return null;
}

function ReviewsContent() {
  const [params] = useSearchParams();
  const requestId = params.get("requestId") ?? "";
  const providerIdParam = params.get("providerId") ?? "";
  const { lang } = useLanguage();

  const [contractId, setContractId] = useState<string | null>(null);
  const [payment, setPayment] = useState<JobPaymentSummary | null>(null);
  const [providerId, setProviderId] = useState(providerIdParam);
  const [isLoading, setIsLoading] = useState(true);

  const [trust, setTrust] = useState<TrustView | null>(null);
  const [reviewCount, setReviewCount] = useState<number | null>(null);

  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [source, setSource] = useState<"typed" | "whisperflow">("typed");
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ trustScore: number; delta: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const [flagReason, setFlagReason] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [showFlag, setShowFlag] = useState(false);

  const trackingUrl = `/tracking?requestId=${requestId}&providerId=${providerId}`;

  // The contract is what a review actually hangs off, and it also tells us who
  // the provider is when the URL did not carry it.
  useEffect(() => {
    if (!requestId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    getContractForRequest(requestId)
      .then(({ contract, payment: summary }) => {
        if (cancelled) return;
        setContractId(contract?.id ?? null);
        setPayment(summary);
        if (summary?.providerId) setProviderId(summary.providerId);
      })
      .catch(() => {
        if (!cancelled) setError("We couldn't load this job. Try opening it again.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const loadTrust = useCallback(async (id: string) => {
    try {
      const [view, reviews] = await Promise.all([
        getProviderTrust(id),
        listProviderReviews(id).catch(() => []),
      ]);
      setTrust(view);
      setReviewCount(reviews.length);
    } catch {
      setTrust(null);
    }
  }, []);

  useEffect(() => {
    if (providerId) void loadTrust(providerId);
  }, [providerId, loadTrust]);

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
      setSource("whisperflow");
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
    if (!contractId) {
      setError("This job has no completed payment to review.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { trust: recomputed } = await submitReview({
        contractId,
        rating: stars,
        tags,
        comment,
        transcriptSource: source,
      });
      // The provider's dashboard picks the new score up over its own refresh;
      // here it is shown immediately so the customer sees their review land.
      setSubmitted({ trustScore: recomputed.trustScore, delta: recomputed.delta });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(
        code === "review_already_exists"
          ? "You've already reviewed this job."
          : code === "contract_not_completed"
            ? "Confirm the job is finished before reviewing it."
            : "Could not submit review. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFlag() {
    if (!flagReason) {
      setError("Please select a reason for flagging.");
      return;
    }
    if (!providerId) return;

    setFlagging(true);
    setError(null);
    try {
      await submitFlag({ providerId, contractId, reason: flagReason });
      setFlagged(true);
      void loadTrust(providerId);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "already_flagged"
          ? "You've already flagged this provider."
          : "Could not submit flag. Please try again.",
      );
    } finally {
      setFlagging(false);
    }
  }

  if (submitted) return <ReviewSuccess />;

  const blocked = isLoading ? null : blockedReason(payment);

  return (
    <div className="reviews-root">
      <AnimatedMeshBg />
      <div className="rv-page z-page-enter-stagger">
        <AppNav backTo={trackingUrl} backLabel="Back to tracking" />

        <header className="rv-hero">
          <div className="rv-badges">
            <span className="rv-badge-dark">
              {blocked ? "Job in progress" : "Job completed"}
            </span>
            <span className="rv-badge-light">Rate provider ›</span>
          </div>
          <h1>How was your experience?</h1>
          <p>
            Your feedback updates trust scores and helps others find reliable
            providers in Addis Ababa.
          </p>
          <div className="rv-request-pill">
            Request <strong>#{requestId.slice(0, 8)}</strong>
            {trust?.providerName && (
              <>
                <span aria-hidden="true">·</span>
                <strong>{trust.providerName}</strong>
              </>
            )}
          </div>
        </header>

        {error && <div className="z-error">{error}</div>}

        <div className="rv-grid">
          <div className="rv-main-card">
            {isLoading ? (
              <div className="z-glass-inner rv-form-inner">
                <p className="rv-section-label">Loading this job…</p>
              </div>
            ) : blocked ? (
              <div className="z-glass-inner rv-form-inner">
                <p className="rv-section-label">Not ready to review</p>
                <p className="rv-trust-explain">{blocked}</p>
                <div className="rv-submit-row">
                  <a href={trackingUrl} className="z-btn z-btn-primary">
                    Back to the job
                  </a>
                </div>
              </div>
            ) : (
              <ReviewForm
                stars={stars}
                tags={tags}
                comment={comment}
                recording={recording}
                submitting={submitting}
                onStarsChange={setStars}
                onToggleTag={toggleTag}
                onCommentChange={setComment}
                onVoice={() => void handleVoiceReview()}
                onSubmit={() => void handleSubmitReview()}
              />
            )}
          </div>

          <aside className="rv-sidebar">
            {trust && (
              <>
                <TrustPanel breakdown={trust} providerName={trust.providerName ?? undefined} />
                <p className="rv-trust-explain">
                  {reviewCount === 0
                    ? "No reviews yet — yours would be the first."
                    : `${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}` +
                      (trust.avgRating === null
                        ? ""
                        : ` · ${trust.avgRating.toFixed(1)} average`)}
                </p>
              </>
            )}
            <FlagPanel
              show={showFlag}
              flagged={flagged}
              flagReason={flagReason}
              flagging={flagging}
              onToggle={() => setShowFlag(true)}
              onCancel={() => setShowFlag(false)}
              onReasonChange={setFlagReason}
              onSubmit={() => void handleFlag()}
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
