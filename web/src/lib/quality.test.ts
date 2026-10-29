import { describe, expect, it } from "vitest";
import {
  DIMENSION_WEIGHTS,
  REVIEW_ACTION_LABEL,
  REVIEW_SECTION_TITLE,
  computeOverallScore,
  parseQualityReview,
  readinessFromScore,
  type ReviewDimension,
} from "./quality";

function dim(key: ReviewDimension["key"], score: number, applicable = true): ReviewDimension {
  return {
    key,
    score,
    applicable,
    explanation: "ok",
    evidence: "line",
    improvement: "",
    suggested_refine_action: "",
  };
}

const full: ReviewDimension[] = [
  dim("hook", 70),
  dim("clarity", 80),
  dim("audience", 60),
  dim("voice", 75),
  dim("value", 82),
  dim("platform_fit", 78),
  dim("cta", 50),
];

describe("review UI copy", () => {
  it("exposes a visible section title and action label", () => {
    expect(REVIEW_SECTION_TITLE).toBe("Quality review");
    expect(REVIEW_ACTION_LABEL).toBe("Review content");
  });
});

describe("quality weighting", () => {
  it("keeps documented weights that sum to 100", () => {
    expect(Object.values(DIMENSION_WEIGHTS).reduce((sum, item) => sum + item, 0)).toBe(100);
  });

  it("renormalises when a dimension is not applicable", () => {
    const withGap = full.map((item) => (item.key === "audience" ? { ...item, applicable: false, score: 0 } : item));
    const all = computeOverallScore(full);
    const partial = computeOverallScore(withGap);
    expect(partial).not.toBe(0);
    expect(partial).not.toBe(all);
  });

  it("rejects malformed reviews and ignores a fake overall score", () => {
    expect(parseQualityReview({})).toBeNull();
    const parsed = parseQualityReview({
      overall_score: 3,
      dimensions: full,
      strengths: ["Clear open"],
      improvements: ["Vague close"],
      recommendations: ["Ask a question"],
      readiness: "",
      disclaimer: "Advisory quality review. Not a forecast of reach, engagement, or results.",
    });
    expect(parsed?.overall_score).toBe(computeOverallScore(full));
    expect(parsed?.overall_score).not.toBe(3);
    expect(parsed?.disclaimer).toMatch(/not a forecast/i);
  });

  it("maps readiness bands without claiming performance", () => {
    expect(readinessFromScore(90)).toMatch(/advisory/);
    expect(readinessFromScore(70)).toMatch(/Polish/);
    expect(readinessFromScore(40)).toMatch(/Not ready/);
  });
});
