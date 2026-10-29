"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignIdeaToDay,
  movePlanItem,
  removePlanItem,
  updatePlanItemStatus,
} from "@/app/studio/planner/actions";
import { isExpiredSessionMessage } from "@/lib/api-auth";
import { formatPlatform } from "@/lib/brand";
import { formatLabel } from "@/lib/content";
import type { IdeaRecord } from "@/lib/ideas";
import {
  WEEKDAY_LABELS,
  canAddToDay,
  createDraftHref,
  formatPlanStatus,
  formatWeekRange,
  groupPlanItems,
  shiftWeek,
  unscheduledIdeas,
  weekProgress,
  type PlanItemRecord,
  type PlanStatus,
} from "@/lib/planner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function PlannerBoard({
  weekStart,
  ideas,
  items,
}: {
  weekStart: string;
  ideas: IdeaRecord[];
  items: PlanItemRecord[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [assignIdeaId, setAssignIdeaId] = useState("");
  const [assignDay, setAssignDay] = useState(0);

  const days = useMemo(() => groupPlanItems(weekStart, items), [weekStart, items]);
  const available = useMemo(() => unscheduledIdeas(ideas, items), [ideas, items]);
  const progress = weekProgress(items);
  const ideaById = useMemo(() => new Map(ideas.map((idea) => [idea.id, idea])), [ideas]);
  const prevWeek = shiftWeek(weekStart, -1);
  const nextWeek = shiftWeek(weekStart, 1);

  function handleExpired(text: string) {
    if (isExpiredSessionMessage(text)) {
      router.push("/login?next=/studio/planner");
      router.refresh();
      return true;
    }
    return false;
  }

  async function run(key: string, work: () => Promise<{ ok: boolean; message?: string }>) {
    setPending(key);
    setMessage(null);
    try {
      const result = await work();
      if (!result.ok) {
        if (result.message && handleExpired(result.message)) return;
        setMessage(result.message ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } catch {
      setMessage("Could not update the plan.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink/70">Week of {formatWeekRange(weekStart)}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink/50">
            {progress.total} planned · {progress.drafted} drafted · {progress.skipped} skipped
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/studio/planner?week=${prevWeek}`} variant="ghost">
            Previous week
          </ButtonLink>
          <ButtonLink href="/studio/planner" variant="ghost">
            This week
          </ButtonLink>
          <ButtonLink href={`/studio/planner?week=${nextWeek}`} variant="ghost">
            Next week
          </ButtonLink>
        </div>
      </div>

      {message ? (
        <p className="text-sm text-ink/70" role="status">
          {message}
        </p>
      ) : null}

      <Card>
        <h2 className="font-serif text-xl">Add from your idea bank</h2>
        <p className="mt-1 text-sm text-ink/65">
          Ideas stay in the bank. Assigning one here only plans a writing day. Nothing is posted.
        </p>
        {ideas.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Save ideas first, then place them on the week.{" "}
            <ButtonLink href="/studio/ideas" variant="ghost">
              Open idea bank
            </ButtonLink>
          </p>
        ) : available.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">Every saved idea is already on this week.</p>
        ) : (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!assignIdeaId) return;
              const dayItems = days[assignDay]?.items ?? [];
              if (!canAddToDay(dayItems)) {
                setMessage("That day already has enough planned ideas.");
                return;
              }
              void run("assign", async () => {
                const result = await assignIdeaToDay({
                  ideaId: assignIdeaId,
                  weekStart,
                  dayOfWeek: assignDay,
                });
                if (result.ok) setAssignIdeaId("");
                return result;
              });
            }}
          >
            <label className="min-w-56 flex-1 text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
              Idea
              <select
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm font-normal normal-case tracking-normal"
                value={assignIdeaId}
                onChange={(event) => setAssignIdeaId(event.target.value)}
              >
                <option value="">Choose a saved idea</option>
                {available.map((idea) => (
                  <option key={idea.id} value={idea.id}>
                    {idea.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
              Day
              <select
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm font-normal normal-case tracking-normal"
                value={assignDay}
                onChange={(event) => setAssignDay(Number(event.target.value))}
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={pending !== null || !assignIdeaId}>
              {pending === "assign" ? "Adding…" : "Add to week"}
            </Button>
          </form>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((day) => (
          <section
            key={day.date}
            className="rounded-2xl border border-ink/10 bg-paper-raised p-3"
            aria-label={day.label}
          >
            <header>
              <h3 className="font-serif text-lg">{day.label}</h3>
              <p className="text-xs text-ink/50">{day.date}</p>
            </header>
            {day.items.length === 0 ? (
              <p className="mt-3 text-sm text-ink/55">No ideas planned.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {day.items.map((slot) => {
                  const idea = ideaById.get(slot.idea_id);
                  return (
                    <li key={slot.id} className="rounded-xl border border-ink/10 bg-paper p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-ink/50">
                        {formatPlanStatus(slot.status)}
                      </p>
                      <p className="mt-1 text-sm font-medium leading-5">
                        {idea?.title ?? "Idea unavailable"}
                      </p>
                      {idea ? (
                        <p className="mt-1 text-xs text-ink/55">
                          {formatPlatform(idea.platform)} · {formatLabel(idea.format)}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-col gap-2">
                        {slot.status !== "drafted" ? (
                          <ButtonLink href={createDraftHref(slot.idea_id, slot.id)}>
                            Create draft
                          </ButtonLink>
                        ) : slot.draft_id ? (
                          <ButtonLink href={`/studio/drafts/${slot.draft_id}`} variant="ghost">
                            Open draft
                          </ButtonLink>
                        ) : (
                          <ButtonLink href={`/studio/create?idea=${slot.idea_id}`} variant="ghost">
                            View idea brief
                          </ButtonLink>
                        )}
                        <label className="text-[10px] uppercase tracking-[0.14em] text-ink/50">
                          Move
                          <select
                            aria-label={`Move ${idea?.title ?? "item"}`}
                            className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-2 py-1.5 text-xs normal-case tracking-normal"
                            value={slot.day_of_week}
                            disabled={pending !== null}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              void run(`move-${slot.id}`, () => movePlanItem(slot.id, next));
                            }}
                          >
                            {WEEKDAY_LABELS.map((label, index) => (
                              <option key={label} value={index}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-[10px] uppercase tracking-[0.14em] text-ink/50">
                          Status
                          <select
                            aria-label={`Status for ${idea?.title ?? "item"}`}
                            className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-2 py-1.5 text-xs normal-case tracking-normal"
                            value={slot.status}
                            disabled={pending !== null}
                            onChange={(event) => {
                              const status = event.target.value as PlanStatus;
                              void run(`status-${slot.id}`, () => updatePlanItemStatus(slot.id, status));
                            }}
                          >
                            <option value="planned">Planned</option>
                            <option value="skipped">Skipped</option>
                            <option value="drafted" disabled>
                              Draft saved
                            </option>
                          </select>
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-3 py-1.5 text-xs"
                          disabled={pending !== null}
                          onClick={() =>
                            void run(`remove-${slot.id}`, () => removePlanItem(slot.id))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
