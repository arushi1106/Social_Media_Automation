import type { IdeaRecord } from "@/lib/ideas";

export const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const PLAN_STATUSES = ["planned", "drafted", "skipped"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const MAX_ITEMS_PER_DAY = 6;

export type PlanItemRow = {
  id: string;
  user_id: string;
  brand_id: string | null;
  idea_id: string;
  draft_id: string | null;
  week_start: string;
  day_of_week: number;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PlanItemRecord = {
  id: string;
  user_id: string;
  brand_id: string | null;
  idea_id: string;
  draft_id: string | null;
  week_start: string;
  day_of_week: number;
  notes: string;
  status: PlanStatus;
  created_at: string;
  updated_at: string;
};

export type PlannerDay = {
  date: string;
  dayOfWeek: number;
  label: string;
  items: PlanItemRecord[];
};

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function utcWeekdayMonday0(isoDate: string): number | null {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return null;
  const utcDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return utcDay === 0 ? 6 : utcDay - 1;
}

export function isMonday(isoDate: string): boolean {
  return utcWeekdayMonday0(isoDate) === 0;
}

export function addDaysIso(isoDate: string, days: number): string | null {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return null;
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return formatIsoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function mondayOfLocal(date = new Date()): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + diff);
  return formatIsoDate(local.getFullYear(), local.getMonth() + 1, local.getDate());
}

export function resolveWeekStart(value?: string | null, today = new Date()): string {
  if (value && isMonday(value)) return value;
  return mondayOfLocal(today);
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return addDaysIso(weekStart, weeks * 7) ?? weekStart;
}

export function formatWeekRange(weekStart: string): string {
  const end = addDaysIso(weekStart, 6);
  if (!end) return weekStart;
  return `${weekStart} – ${end}`;
}

export function weekDays(weekStart: string): PlannerDay[] {
  if (!isMonday(weekStart)) return [];
  return WEEKDAY_LABELS.map((label, dayOfWeek) => ({
    date: addDaysIso(weekStart, dayOfWeek) ?? weekStart,
    dayOfWeek,
    label,
    items: [],
  }));
}

export function isPlanStatus(value: string): value is PlanStatus {
  return (PLAN_STATUSES as readonly string[]).includes(value);
}

export function planItemFromRow(row: PlanItemRow): PlanItemRecord | null {
  const weekStart = row.week_start.slice(0, 10);
  if (!isMonday(weekStart)) return null;
  if (!Number.isInteger(row.day_of_week) || row.day_of_week < 0 || row.day_of_week > 6) return null;
  if (!row.idea_id || !row.user_id) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    brand_id: row.brand_id,
    idea_id: row.idea_id,
    draft_id: row.draft_id,
    week_start: weekStart,
    day_of_week: row.day_of_week,
    notes: (row.notes ?? "").trim(),
    status: isPlanStatus(row.status) ? row.status : "planned",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toPlanWritePayload(options: {
  sessionUserId: string;
  brandId: string | null;
  ideaId: string;
  weekStart: string;
  dayOfWeek: number;
  notes?: string;
}): {
  user_id: string;
  brand_id: string | null;
  idea_id: string;
  week_start: string;
  day_of_week: number;
  notes: string;
  status: "planned";
} {
  if (!options.sessionUserId) {
    throw new Error("Authenticated user id is required.");
  }
  if (!options.ideaId) {
    throw new Error("An idea is required.");
  }
  if (!isMonday(options.weekStart)) {
    throw new Error("week_start must be a Monday.");
  }
  if (!Number.isInteger(options.dayOfWeek) || options.dayOfWeek < 0 || options.dayOfWeek > 6) {
    throw new Error("Choose a day in the week.");
  }
  return {
    user_id: options.sessionUserId,
    brand_id: options.brandId,
    idea_id: options.ideaId,
    week_start: options.weekStart,
    day_of_week: options.dayOfWeek,
    notes: (options.notes ?? "").trim().slice(0, 400),
    status: "planned",
  };
}

export function groupPlanItems(weekStart: string, items: PlanItemRecord[]): PlannerDay[] {
  const days = weekDays(weekStart);
  items
    .filter((item) => item.week_start === weekStart)
    .forEach((item) => {
      const day = days[item.day_of_week];
      if (day) day.items.push(item);
    });
  return days;
}

export function unscheduledIdeas(ideas: IdeaRecord[], items: PlanItemRecord[]): IdeaRecord[] {
  const scheduled = new Set(items.map((item) => item.idea_id));
  return ideas.filter((idea) => !scheduled.has(idea.id));
}

export function weekProgress(items: PlanItemRecord[]): {
  planned: number;
  drafted: number;
  skipped: number;
  total: number;
} {
  const drafted = items.filter((item) => item.status === "drafted").length;
  const skipped = items.filter((item) => item.status === "skipped").length;
  const planned = items.filter((item) => item.status === "planned").length;
  return { planned, drafted, skipped, total: items.length };
}

export function canAddToDay(itemsOnDay: PlanItemRecord[]): boolean {
  return itemsOnDay.length < MAX_ITEMS_PER_DAY;
}

export function formatPlanStatus(status: PlanStatus): string {
  return {
    planned: "Planned",
    drafted: "Draft saved",
    skipped: "Skipped",
  }[status];
}

export function createDraftHref(ideaId: string, planItemId: string): string {
  return `/studio/create?idea=${encodeURIComponent(ideaId)}&plan=${encodeURIComponent(planItemId)}`;
}
