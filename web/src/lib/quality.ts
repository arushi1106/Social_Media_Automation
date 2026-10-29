import type { RefineAction } from "@/lib/refine";

export const REVIEW_DIMENSIONS = [
  "hook",
  "clarity",
  "audience",
  "voice",
  "value",
  "platform_fit",
  "cta",
] as const;

export type ReviewDimensionKey = (typeof REVIEW_DIMENSIONS)[number];

export const DIMENSION_WEIGHTS: Record<ReviewDimensionKey, number> = {
  hook: 16,
  clarity: 18,
  audience: 14,
  voice: 14,
  value: 16,
  platform_fit: 12,
  cta: 10,
};

export const DIMENSION_LABELS: Record<ReviewDimensionKey, string> = {
  hook: "Hook and opening",
  clarity: "Clarity and readability",
  audience: "Audience relevance",
  voice: "Brand voice",
  value: "Value and substance",
  platform_fit: "Platform and format fit",
  cta: "Call to action and conclusion",
};

export type ReviewDimension = {
  key: ReviewDimensionKey;
  score: number;
  applicable: boolean;
  explanation: string;
  evidence: string;
  improvement: string;
  suggested_refine_action: RefineAction | "";
};

export type QualityReview = {
  overall_score: number;
  dimensions: ReviewDimension[];
  strengths: string[];
  improvements: string[];
  recommendations: string[];
  readiness: string;
  scoring_notes: string;
  disclaimer: string;
  limited_context: string[];
};

const REFINE_ACTIONS: RefineAction[] = [
  "conversational",
  "professional",
  "engaging",
  "shorten",
  "expand",
  "improve_hook",
  "improve_cta",
  "custom",
];

export function isReviewDimensionKey(value: string): value is ReviewDimensionKey {
  return (REVIEW_DIMENSIONS as readonly string[]).includes(value);
}

export function computeOverallScore(dimensions: ReviewDimension[]): number {
  const scored = dimensions.filter((item) => item.applicable);
  const weightTotal = scored.reduce((sum, item) => sum + DIMENSION_WEIGHTS[item.key], 0);
  if (!scored.length || weightTotal <= 0) return 0;
  const weighted = scored.reduce((sum, item) => sum + item.score * DIMENSION_WEIGHTS[item.key], 0);
  return Math.round(weighted / weightTotal);
}

export function readinessFromScore(overall: number): string {
  if (overall >= 80) {
    return "Consider this ready to copy or keep. Read it once yourself; this score is advisory.";
  }
  if (overall >= 65) {
    return "A useful draft. Polish the flagged dimensions before treating it as ready.";
  }
  return "Not ready yet. Address the improvements, then review again.";
}

export function suggestedRefineAction(value: string): RefineAction | "" {
  return (REFINE_ACTIONS as readonly string[]).includes(value) ? (value as RefineAction) : "";
}

export function parseQualityReview(value: unknown): QualityReview | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.dimensions)) return null;
  const dimensions: ReviewDimension[] = [];
  for (const item of raw.dimensions) {
    if (!item || typeof item !== "object") return null;
    const dim = item as Record<string, unknown>;
    if (typeof dim.key !== "string" || !isReviewDimensionKey(dim.key)) return null;
    const score = Number(dim.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) return null;
    dimensions.push({
      key: dim.key,
      score: Math.round(score),
      applicable: dim.applicable !== false,
      explanation: typeof dim.explanation === "string" ? dim.explanation : "",
      evidence: typeof dim.evidence === "string" ? dim.evidence : "",
      improvement: typeof dim.improvement === "string" ? dim.improvement : "",
      suggested_refine_action:
        typeof dim.suggested_refine_action === "string"
          ? suggestedRefineAction(dim.suggested_refine_action)
          : "",
    });
  }
  if (dimensions.length !== REVIEW_DIMENSIONS.length) return null;
  const overall = computeOverallScore(dimensions);
  const strings = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  return {
    overall_score: overall,
    dimensions,
    strengths: strings(raw.strengths),
    improvements: strings(raw.improvements),
    recommendations: strings(raw.recommendations),
    readiness: typeof raw.readiness === "string" && raw.readiness.trim() ? raw.readiness : readinessFromScore(overall),
    scoring_notes:
      typeof raw.scoring_notes === "string"
        ? raw.scoring_notes
        : "Weighted average of applicable dimensions. Advisory only.",
    disclaimer:
      typeof raw.disclaimer === "string"
        ? raw.disclaimer
        : "Advisory quality review. Not a forecast of reach, engagement, or results.",
    limited_context: strings(raw.limited_context),
  };
}

export function lowestApplicableImprovements(review: QualityReview): ReviewDimension[] {
  return review.dimensions
    .filter((item) => item.applicable && item.score < 80 && item.suggested_refine_action)
    .sort((a, b) => a.score - b.score);
}
