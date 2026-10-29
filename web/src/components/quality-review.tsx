"use client";

import { DIMENSION_LABELS, DIMENSION_WEIGHTS, lowestApplicableImprovements, type QualityReview } from "@/lib/quality";
import { REFINE_ACTION_LABELS, type RefineAction } from "@/lib/refine";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function QualityReviewPanel({
  review,
  onImprove,
  disabled,
}: {
  review: QualityReview;
  onImprove: (action: RefineAction) => void;
  disabled?: boolean;
}) {
  const suggested = lowestApplicableImprovements(review);

  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Quality review</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-serif text-4xl">{review.overall_score}</p>
          <p className="text-sm text-ink/60">out of 100 · advisory score</p>
        </div>
        <p className="max-w-md text-sm leading-6 text-ink/75">{review.readiness}</p>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink/55">{review.disclaimer}</p>
      {review.limited_context.length ? (
        <p className="mt-2 text-xs text-ink/55">
          Limited brand context: {review.limited_context.join(", ")}. Those dimensions were not scored as failures.
        </p>
      ) : null}

      <ul className="mt-5 space-y-3">
        {review.dimensions.map((dimension) => (
          <li key={dimension.key} className="rounded-xl border border-ink/10 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{DIMENSION_LABELS[dimension.key]}</h3>
              <p className="text-sm text-ink/60">
                {dimension.applicable ? `${dimension.score}/100 · weight ${DIMENSION_WEIGHTS[dimension.key]}` : "Not assessed"}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink/80">{dimension.explanation}</p>
            {dimension.evidence ? (
              <p className="mt-1 text-sm leading-6 text-ink/65">
                <span className="text-xs uppercase tracking-[0.14em] text-ink/45">From the draft · </span>
                {dimension.evidence}
              </p>
            ) : null}
            {dimension.improvement ? (
              <p className="mt-1 text-sm leading-6 text-ink/80">{dimension.improvement}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {review.strengths.length ? (
        <div className="mt-5">
          <h3 className="text-xs uppercase tracking-[0.14em] text-ink/50">Strengths</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink/80">
            {review.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {review.improvements.length ? (
        <div className="mt-5">
          <h3 className="text-xs uppercase tracking-[0.14em] text-ink/50">Areas to improve</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink/80">
            {review.improvements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {review.recommendations.length ? (
        <div className="mt-5">
          <h3 className="text-xs uppercase tracking-[0.14em] text-ink/50">Recommendations</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink/80">
            {review.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6">
        <h3 className="text-xs uppercase tracking-[0.14em] text-ink/50">Improve with existing refinements</h3>
        <p className="mt-1 text-sm text-ink/65">
          These actions run the current rewrite tools. They do not publish and they do not replace this review.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggested.length ? (
            suggested.map((item) => (
              <Button
                key={`${item.key}-${item.suggested_refine_action}`}
                type="button"
                variant="ghost"
                disabled={disabled || !item.suggested_refine_action}
                onClick={() => {
                  if (!item.suggested_refine_action) return;
                  document.getElementById("refine-panel")?.scrollIntoView({ behavior: "smooth" });
                  onImprove(item.suggested_refine_action);
                }}
              >
                {REFINE_ACTION_LABELS[item.suggested_refine_action as RefineAction]}
              </Button>
            ))
          ) : (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => document.getElementById("refine-panel")?.scrollIntoView({ behavior: "smooth" })}
            >
              Open refinement tools
            </Button>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-ink/50">{review.scoring_notes}</p>
    </Card>
  );
}
