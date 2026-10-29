import { describe, expect, it } from "vitest";
import { isOwnedBy } from "./content";
import type { IdeaRecord } from "./ideas";
import {
  addDaysIso,
  canAddToDay,
  createDraftHref,
  formatWeekRange,
  groupPlanItems,
  isMonday,
  MAX_ITEMS_PER_DAY,
  mondayOfLocal,
  resolveWeekStart,
  shiftWeek,
  toPlanWritePayload,
  unscheduledIdeas,
  weekDays,
  weekProgress,
  type PlanItemRecord,
} from "./planner";

function idea(id: string): IdeaRecord {
  return {
    id,
    user_id: "session-user",
    brand_id: "brand-1",
    title: `Idea ${id}`,
    concept: "Concept",
    why_relevant: "",
    angle: "",
    hook: "",
    format: "text_post",
    call_to_action: "",
    pillar: "",
    platform: "linkedin",
    status: "saved",
    created_at: "2026-10-01",
    updated_at: "2026-10-01",
  };
}

function item(overrides: Partial<PlanItemRecord> = {}): PlanItemRecord {
  return {
    id: "plan-1",
    user_id: "session-user",
    brand_id: "brand-1",
    idea_id: "idea-1",
    draft_id: null,
    week_start: "2026-10-26",
    day_of_week: 0,
    notes: "",
    status: "planned",
    created_at: "2026-10-26",
    updated_at: "2026-10-26",
    ...overrides,
  };
}

describe("week helpers", () => {
  it("treats Monday as the start of the week", () => {
    expect(isMonday("2026-10-26")).toBe(true);
    expect(isMonday("2026-10-27")).toBe(false);
    expect(isMonday("not-a-date")).toBe(false);
    expect(addDaysIso("2026-10-26", 6)).toBe("2026-11-01");
    expect(shiftWeek("2026-10-26", 1)).toBe("2026-11-02");
    expect(formatWeekRange("2026-10-26")).toBe("2026-10-26 – 2026-11-01");
    expect(weekDays("2026-10-26")).toHaveLength(7);
    expect(weekDays("2026-10-26")[0].label).toBe("Monday");
    expect(weekDays("2026-10-27")).toHaveLength(0);
  });

  it("falls back to the local Monday when the query is invalid", () => {
    const monday = mondayOfLocal(new Date(2026, 9, 29));
    expect(monday).toBe("2026-10-26");
    expect(resolveWeekStart("nope", new Date(2026, 9, 29))).toBe("2026-10-26");
    expect(resolveWeekStart("2026-10-26")).toBe("2026-10-26");
  });
});

describe("plan persistence mapping", () => {
  it("uses the session user id and requires a Monday week start", () => {
    const payload = toPlanWritePayload({
      sessionUserId: "session-user",
      brandId: "brand-1",
      ideaId: "idea-1",
      weekStart: "2026-10-26",
      dayOfWeek: 2,
    });
    expect(payload.user_id).toBe("session-user");
    expect(payload.status).toBe("planned");
    expect(payload.day_of_week).toBe(2);
    expect(() =>
      toPlanWritePayload({
        sessionUserId: "session-user",
        brandId: null,
        ideaId: "idea-1",
        weekStart: "2026-10-27",
        dayOfWeek: 0,
      }),
    ).toThrow(/Monday/);
    expect(isOwnedBy({ user_id: "a" }, "b")).toBe(false);
  });
});

describe("board grouping and progress", () => {
  it("places items on the matching weekday and leaves others unscheduled", () => {
    const items = [
      item({ id: "p1", idea_id: "idea-1", day_of_week: 0, status: "planned" }),
      item({ id: "p2", idea_id: "idea-2", day_of_week: 3, status: "drafted" }),
    ];
    const days = groupPlanItems("2026-10-26", items);
    expect(days[0].items).toHaveLength(1);
    expect(days[3].items[0].status).toBe("drafted");
    expect(unscheduledIdeas([idea("idea-1"), idea("idea-3")], items).map((row) => row.id)).toEqual([
      "idea-3",
    ]);
    expect(weekProgress(items)).toEqual({ planned: 1, drafted: 1, skipped: 0, total: 2 });
  });

  it("caps items per day and builds a create-draft link that keeps the plan slot", () => {
    expect(canAddToDay(Array.from({ length: MAX_ITEMS_PER_DAY }, () => item()))).toBe(false);
    expect(createDraftHref("idea-1", "plan-9")).toBe("/studio/create?idea=idea-1&plan=plan-9");
  });
});
