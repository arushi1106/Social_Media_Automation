import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StrategyReport } from "@/lib/strategy";

function mixCaption(kind: StrategyReport["mix"][number]["kind"]): string {
  if (kind === "former") return "Removed pillar snapshot";
  if (kind === "unassigned") return "No pillar id";
  return "Live pillar";
}

export function StrategyOverview({
  report,
  errors,
}: {
  report: StrategyReport;
  errors: string[];
}) {
  return (
    <div className="space-y-6">
      {errors.length ? (
        <p className="text-sm text-accent" role="alert">
          {errors.join(" ")} Some numbers may be incomplete.
        </p>
      ) : null}

      <Card>
        <h2 className="font-serif text-2xl">Overview</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          These counts are saved records in your account: content pillars and{" "}
          <code className="font-mono text-xs">content_items</code> drafts. They are not
          engagement, reach, or publishing results. Planned ideas are not drafts.
        </p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Saved pillars</dt>
            <dd className="mt-1 font-serif text-3xl">{report.pillarCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Saved drafts</dt>
            <dd className="mt-1 font-serif text-3xl">{report.draftCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Pillars with drafts</dt>
            <dd className="mt-1 font-serif text-3xl">{report.representedPillarCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Pillars with no drafts</dt>
            <dd className="mt-1 font-serif text-3xl">{report.emptyPillarCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Unassigned drafts</dt>
            <dd className="mt-1 font-serif text-3xl">{report.unassignedDraftCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Removed-pillar drafts</dt>
            <dd className="mt-1 font-serif text-3xl">{report.formerDraftCount}</dd>
          </div>
        </dl>
        {report.pillarCount === 0 && report.draftCount === 0 ? (
          <p className="mt-6 text-sm leading-6 text-ink/70">
            Nothing saved yet. Add pillars in Brand settings, then create a draft. Mix
            appears after you save copy—not when you only plan an idea.
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Saved-draft mix</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          Distribution of your saved drafts by the pillar id stored when you generated them.
          This is not audience mix or performance.
        </p>
        {report.draftCount === 0 ? (
          <p className="mt-6 text-sm leading-6 text-ink/70">
            {report.pillarCount === 0
              ? "Save a pillar and a draft to see distribution."
              : "You have pillars but no saved drafts, so every live pillar currently shows zero."}
          </p>
        ) : null}
        {report.mix.length === 0 ? null : (
          <ul className="mt-6 space-y-4" aria-label="Saved drafts per pillar">
            {report.mix.map((row) => (
              <li key={row.key}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {row.name}{" "}
                    <span className="text-xs font-normal uppercase tracking-[0.14em] text-ink/50">
                      {mixCaption(row.kind)}
                    </span>
                  </p>
                  <p className="text-sm text-ink/70">
                    {row.draftCount} of {report.draftCount} drafts ({row.shareOfDrafts}%)
                  </p>
                </div>
                {row.description ? (
                  <p className="mt-1 text-sm leading-6 text-ink/65">{row.description}</p>
                ) : null}
                <div
                  className="mt-2 h-3 overflow-hidden rounded-full bg-ink/10"
                  role="img"
                  aria-label={`${row.name}: ${row.draftCount} saved drafts, ${row.shareOfDrafts} percent`}
                >
                  <div
                    className={
                      row.kind === "unassigned"
                        ? "h-full rounded-full bg-ink/45"
                        : row.kind === "former"
                          ? "h-full rounded-full border border-dashed border-ink/40 bg-ink/20"
                          : "h-full rounded-full bg-accent"
                    }
                    style={{ width: `${report.draftCount === 0 ? 0 : Math.max(row.shareOfDrafts, row.draftCount > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Possible gaps</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          These notes only describe missing or uneven tags in your saved records. They are
          not marketing benchmarks, and a smaller count is not underperformance.
        </p>
        {report.gaps.length === 0 ? (
          <p className="mt-6 text-sm leading-6 text-ink/70">
            Not enough tagged drafts to point out a gap. Save more drafts, or tag new ones
            with a pillar when you create them.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {report.gaps.map((gap) => (
              <li key={gap.id}>
                <p className="font-medium">{gap.title}</p>
                <p className="mt-1 text-sm leading-6 text-ink/70">{gap.evidence}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Suggested next steps</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          Each item is computed from the counts above. Opening Create with a pillar is an
          explicit choice you make here; the form does not silently pick a pillar on its own.
        </p>
        {report.recommendations.length === 0 ? (
          <p className="mt-6 text-sm leading-6 text-ink/70">No extra actions from the current records.</p>
        ) : (
          <ul className="mt-6 space-y-5">
            {report.recommendations.map((item) => (
              <li key={item.id} className="border-t border-ink/10 pt-5 first:border-t-0 first:pt-0">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-ink/70">
                  <span className="uppercase tracking-[0.14em] text-ink/50">Evidence. </span>
                  {item.evidence}
                </p>
                <div className="mt-3">
                  <ButtonLink href={item.href} variant="ghost">
                    {item.action}
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-xl">What this page does not do</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-ink/70">
          {report.limitations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink href="/studio/create" variant="ghost">
            Create without a preselected pillar
          </ButtonLink>
          <ButtonLink href="/studio/ideas" variant="ghost">
            Idea Bank
          </ButtonLink>
          <ButtonLink href="/studio/brand#content-pillars" variant="ghost">
            Manage pillars
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
