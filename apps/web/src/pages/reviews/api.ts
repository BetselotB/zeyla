import type {
  ApiResponse,
  ProviderTrustDto,
  ReviewDto,
  TrustScoreBreakdown,
} from "@zeyla/shared";
import { API_BASE, authHeaders } from "../../auth/session";

/**
 * Reviews and flags, keyed off the contract rather than the request.
 *
 * A review is only meaningful once money has changed hands, so the server
 * requires a completed contract. The screen therefore resolves request ->
 * contract first, and everything below takes the contract id from there.
 */

interface Options {
  method?: "GET" | "POST";
  body?: unknown;
}

async function call<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body } = options;

  const headers: Record<string, string> = await authHeaders();
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const envelope = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!envelope?.success || envelope.data == null) {
    throw new Error(envelope?.error ?? `request_failed_${res.status}`);
  }
  return envelope.data;
}

export interface SubmitReviewInput {
  contractId: string;
  rating: number;
  /** Quick tags are folded into the comment — the server stores prose. */
  tags: string[];
  comment: string;
  transcriptSource: "typed" | "whisperflow";
}

const TAG_LABELS: Record<string, string> = {
  on_time: "On time",
  professional: "Professional",
  would_recommend: "Would recommend",
};

function composeComment(input: SubmitReviewInput): string | null {
  const tagLine = input.tags.map((tag) => TAG_LABELS[tag] ?? tag).join(" · ");
  const body = input.comment.trim();
  if (!tagLine && !body) return null;
  if (!tagLine) return body;
  return body ? `${tagLine} — ${body}` : tagLine;
}

export interface SubmitReviewResult {
  review: ReviewDto;
  trust: { trustScore: number; delta: number; changed: boolean };
}

export function submitReview(
  input: SubmitReviewInput,
): Promise<SubmitReviewResult> {
  return call<SubmitReviewResult>("/trust/reviews", {
    method: "POST",
    body: {
      contractId: input.contractId,
      rating: input.rating,
      comment: composeComment(input),
      transcriptSource: input.transcriptSource,
    },
  });
}

export function submitFlag(input: {
  providerId: string;
  contractId?: string | null;
  reason: string;
}): Promise<unknown> {
  return call("/trust/flags", {
    method: "POST",
    body: {
      providerId: input.providerId,
      contractId: input.contractId ?? null,
      reason: input.reason,
    },
  });
}

export interface TrustView extends TrustScoreBreakdown {
  explanation: string;
  providerName: string | null;
  reviewCount: number;
  avgRating: number | null;
}

export async function getProviderTrust(providerId: string): Promise<TrustView> {
  const data = await call<ProviderTrustDto>(
    `/trust/providers/${encodeURIComponent(providerId)}`,
  );
  return {
    ...data.breakdown,
    explanation: data.explanation.summary,
    providerName: data.providerName,
    reviewCount: data.stats.reviewCount,
    avgRating: data.stats.avgRating,
  };
}

export async function listProviderReviews(
  providerId: string,
): Promise<ReviewDto[]> {
  const { reviews } = await call<{ reviews: ReviewDto[] }>(
    `/trust/providers/${encodeURIComponent(providerId)}/reviews`,
  );
  return reviews;
}
