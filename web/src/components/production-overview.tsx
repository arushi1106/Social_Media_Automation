"use client";

import { useMemo, useState } from "react";
import { formatPlatform, isPlatform } from "@/lib/brand";
import { humanStatus, type DraftRow } from "@/lib/content";
import type { IdeaRecord } from "@/lib/ideas";
import {
  buildProductionSnapshot,
  productionEmptyCopy,
  type WorkflowStage,
} from "@/lib/production";
import type { ContentPillar } from "@/lib/pillars";
import type { ContentProject } from "@/lib/projects";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ProductionOverview({
  drafts,
  ideas,
  pillars,
  projects,
  loadError,
}: {
  drafts: DraftRow[];
  ideas: IdeaRecord[];
  pillars: ContentPillar[];
  projects: ContentProject[];
  loadError: string | null;
}) {
  const snapshot = useMemo(
    () => buildProductionSnapshot(drafts, ideas, pillars, projects),
    [drafts, ideas, pillars, projects],
  );
  const [stage, setStage] = useState<WorkflowStage | "all">("all");
  const [platform, setPlatform] = useState("");
  const empty = productionEmptyCopy(snapshot);

  const visibleDrafts = drafts.filter((row) => {
    if (stage === "idea") return false;
    if (stage === "drafting" && row.status === "ready") return false;
    if (stage === "ready" && row.status !== "ready") return false;
    if (platform && row.platform !== platform) return false;
    return true;
  });
  const visibleIdeas = stage === "all" || stage === "idea" ? ideas.filter((idea) => idea.status === "saved") : [];

  return (
    <div className="space-y-8">
      {loadError ? (
        <p className="text-sm text-accent" role="alert">
          {loadError}
        </p>
      ) : null}
      <p className="text-sm leading-6 text-ink/70">
        Counts come from your saved ideas and drafts. They are not reach, engagement, or publishing
        metrics. Quality review still happens on the draft page.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Saved ideas</p>
          <p className="mt-2 font-serif text-3xl">{snapshot.ideaCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Drafting</p>
          <p className="mt-2 font-serif text-3xl">{snapshot.draftingCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Ready for use</p>
          <p className="mt-2 font-serif text-3xl">{snapshot.readyCount}</p>
        </Card>
      </div>
      {empty ? (
        <p className="text-sm leading-6 text-ink/70" role="status">
          {empty}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All work"],
            ["idea", "Ideas"],
            ["drafting", "Drafting"],
            ["ready", "Ready for use"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={stage === value}
            className={`rounded-full border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              stage === value ? "border-accent bg-accent/10" : "border-ink/15"
            }`}
            onClick={() => setStage(value)}
          >
            {label}
          </button>
        ))}
        <label className="sr-only" htmlFor="work-platform">
          Filter by platform
        </label>
        <select
          id="work-platform"
          className="rounded-full border border-ink/15 bg-paper px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
        >
          <option value="">All platforms</option>
          <option value="linkedin">LinkedIn</option>
          <option value="instagram">Instagram</option>
        </select>
      </div>

      <Card>
        <h2 className="font-serif text-xl">Recently updated drafts</h2>
        {snapshot.recentDrafts.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">No drafts to continue yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {snapshot.recentDrafts.map((row) => (
              <li key={row.id}>
                <a className="underline underline-offset-2" href={`/studio/drafts/${row.id}`}>
                  {row.title || row.topic || "Untitled"}
                </a>
                <span className="text-ink/60">
                  {" "}
                  · {humanStatus(row.status)}
                  {isPlatform(row.platform) ? ` · ${formatPlatform(row.platform)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-serif text-xl">By platform</h2>
          {snapshot.byPlatform.length === 0 ? (
            <p className="mt-3 text-sm text-ink/70">No drafts grouped yet.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {snapshot.byPlatform.map((item) => (
                <li key={item.platform}>
                  {isPlatform(item.platform) ? formatPlatform(item.platform) : item.platform}: {item.count}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="font-serif text-xl">By pillar</h2>
          {snapshot.byPillar.length === 0 ? (
            <p className="mt-3 text-sm text-ink/70">No pillar snapshots on drafts yet.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {snapshot.byPillar.map((item) => (
                <li key={item.key}>
                  {item.label}: {item.count}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {snapshot.unfinishedProjects.length > 0 ? (
        <Card>
          <h2 className="font-serif text-xl">Projects with unfinished work</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {snapshot.unfinishedProjects.map((item) => (
              <li key={item.id}>
                <a className="underline underline-offset-2" href={`/studio/projects/${item.id}`}>
                  {item.name}
                </a>
                <span className="text-ink/60">
                  {" "}
                  · {item.ideas} open idea{item.ideas === 1 ? "" : "s"} · {item.drafting} draft
                  {item.drafting === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section>
        <h2 className="font-serif text-2xl">Work list</h2>
        {stage !== "ready" && visibleIdeas.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {visibleIdeas.map((idea) => (
              <li key={idea.id} className="rounded-xl border border-ink/10 p-4 text-sm">
                <p className="font-medium">{idea.title}</p>
                <p className="mt-1 text-ink/70">{idea.concept}</p>
                <div className="mt-3">
                  <ButtonLink href={`/studio/create?idea=${idea.id}`} variant="ghost">
                    Create draft
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {visibleDrafts.length === 0 && (stage === "ready" || stage === "drafting" || visibleIdeas.length === 0) ? (
          <p className="mt-4 text-sm text-ink/70">Nothing in this filter.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {visibleDrafts.map((row) => (
              <li key={row.id} className="rounded-xl border border-ink/10 p-4 text-sm">
                <p className="font-medium">{row.title || row.topic || "Untitled"}</p>
                <p className="mt-1 text-ink/60">
                  {humanStatus(row.status)}
                  {isPlatform(row.platform) ? ` · ${formatPlatform(row.platform)}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink href={`/studio/drafts/${row.id}`} variant="ghost">
                    Continue
                  </ButtonLink>
                  <ButtonLink href={`/studio/drafts/${row.id}#quality-review`} variant="ghost">
                    Quality review
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
