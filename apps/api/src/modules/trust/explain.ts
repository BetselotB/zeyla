import type { TrustExplanation, TrustFactor, TrustScoreBreakdown } from "@zeyla/shared";
import { TRUST_SCORE_MAX } from "@zeyla/shared";
import { rewriteTrustSummary } from "../marketplace/ai/addisAi.js";
import type { TrustInputs } from "./trust.service.js";

const round = (n: number) => Math.round(n * 10) / 10;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Deterministic "why this score" text.
 *
 * This is the fallback *and* the source of truth: Addis AI only ever rephrases
 * these same factors, so the explanation stays correct with no API key, no
 * network, and no chance of the model inventing a reason.
 */
export function buildTrustExplanation(
  breakdown: TrustScoreBreakdown,
  inputs: TrustInputs,
  providerName: string | null,
): TrustExplanation {
  const who = providerName?.split(" ")[0] ?? "This provider";
  const factors: TrustFactor[] = [
    {
      key: "base",
      label: "Starting score",
      points: breakdown.base,
      detail: "Every verified listing starts at 50.",
    },
    {
      key: "completed_contracts",
      label: "Completed jobs",
      points: round(breakdown.completedContracts),
      detail:
        inputs.completedContracts === 0
          ? "No jobs finished through Zeyla yet."
          : `${plural(inputs.completedContracts, "job", "jobs")} finished through Zeyla` +
            (breakdown.completedContracts >= 20 ? " (at the +20 cap)." : "."),
    },
    {
      key: "reviews",
      label: "Customer reviews",
      points: round(breakdown.reviewBonus),
      detail:
        inputs.avgRating === null
          ? "No reviews yet, so no points either way."
          : `${round(inputs.avgRating)} out of 5 across ${plural(inputs.reviewCount, "review", "reviews")}.`,
    },
    {
      key: "kyc",
      label: "ID check",
      points: breakdown.kycBonus,
      detail: inputs.kycSubmitted
        ? "Government ID and selfie submitted."
        : "No ID submitted yet.",
    },
    {
      key: "firecrawl",
      label: "Public profile",
      points: breakdown.firecrawlBonus,
      detail: inputs.firecrawlMatched
        ? "Matched a public business profile."
        : "No matching public profile found.",
    },
    {
      key: "flags",
      label: "Flags",
      points: round(breakdown.flagPenalty),
      detail:
        inputs.flagsReceived === 0
          ? "No complaints from customers."
          : `${plural(inputs.flagsReceived, "complaint", "complaints")} from customers, −5 each.`,
    },
  ];

  return {
    headline: `Trust score ${round(breakdown.total)} out of ${TRUST_SCORE_MAX}`,
    summary: buildSummary(who, breakdown, inputs),
    factors,
    source: "template",
  };
}

/**
 * Optional Addis AI pass over the same explanation.
 *
 * Only the prose changes: the factor list, the points and the total stay
 * exactly as computed, and a failed or unconfigured call returns the template
 * untouched. The model is handed the finished facts, so it has nothing to
 * invent.
 */
export async function withAiSummary(
  explanation: TrustExplanation,
): Promise<TrustExplanation> {
  const facts = [
    explanation.headline,
    ...explanation.factors.map((f) => `${f.label}: ${f.points >= 0 ? "+" : ""}${f.points} — ${f.detail}`),
  ].join("\n");

  const summary = await rewriteTrustSummary(facts);
  if (!summary) return explanation;

  return { ...explanation, summary, source: "addis_ai" };
}

function buildSummary(
  who: string,
  breakdown: TrustScoreBreakdown,
  inputs: TrustInputs,
): string {
  const parts: string[] = [];

  parts.push(
    inputs.completedContracts === 0
      ? `${who} has not completed a job through Zeyla yet`
      : `${who} has completed ${plural(inputs.completedContracts, "job", "jobs")} through Zeyla`,
  );

  if (inputs.avgRating !== null) {
    parts.push(
      `averages ${round(inputs.avgRating)} out of 5 from ${plural(inputs.reviewCount, "review", "reviews")}`,
    );
  }
  if (inputs.kycSubmitted) parts.push("has submitted a government ID");
  if (inputs.firecrawlMatched) parts.push("matches a public business profile");

  const positives = joinList(parts);
  const flagNote =
    inputs.flagsReceived === 0
      ? "No customer has flagged them."
      : `${plural(inputs.flagsReceived, "customer has", "customers have")} flagged them, costing ${Math.abs(round(breakdown.flagPenalty))} points.`;

  return `${positives}. ${flagNote} Starting from a base of ${breakdown.base}, that works out to ${round(breakdown.total)} out of ${TRUST_SCORE_MAX}.`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
