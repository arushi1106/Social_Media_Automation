"use server";

import { revalidatePath } from "next/cache";
import { saveErrorMessage } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { isOwnedBy } from "@/lib/content";
import { loadOwnedIdea } from "@/app/studio/ideas/actions";
import {
  canAddToDay,
  isMonday,
  isPlanStatus,
  planItemFromRow,
  toPlanWritePayload,
  type PlanItemRecord,
  type PlanItemRow,
  type PlanStatus,
} from "@/lib/planner";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PLAN_COLUMNS =
  "id, user_id, brand_id, idea_id, draft_id, week_start, day_of_week, notes, status, created_at, updated_at";

export type PlanResult = { ok: true; id: string } | { ok: false; message: string };

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!user) {
    return { ok: false as const, error: "Your session expired. Sign in again." };
  }
  return { ok: true as const, supabase, user, brand };
}

function touchPlanner() {
  revalidatePath("/studio/planner");
  revalidatePath("/studio/ideas");
}

export async function listPlanItemsForWeek(
  weekStart: string,
): Promise<{ items: PlanItemRecord[]; error: string | null }> {
  const ctx = await session();
  if (!ctx.ok) return { items: [], error: ctx.error };
  if (!isMonday(weekStart)) {
    return { items: [], error: "Choose a week that starts on Monday." };
  }
  const { data, error } = await ctx.supabase
    .from("content_plan_items")
    .select(PLAN_COLUMNS)
    .eq("user_id", ctx.user.id)
    .eq("week_start", weekStart)
    .order("day_of_week", { ascending: true });
  if (error) {
    return { items: [], error: saveErrorMessage(error) };
  }
  const rows = (data ?? []) as PlanItemRow[];
  return {
    items: rows
      .filter((row) => isOwnedBy(row, ctx.user.id))
      .map(planItemFromRow)
      .filter((item): item is PlanItemRecord => item !== null),
    error: null,
  };
}

export async function loadOwnedPlanItem(planItemId: string): Promise<PlanItemRecord | null> {
  const ctx = await session();
  if (!ctx.ok) return null;
  const { data } = await ctx.supabase
    .from("content_plan_items")
    .select(PLAN_COLUMNS)
    .eq("id", planItemId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!data || !isOwnedBy(data, ctx.user.id)) return null;
  return planItemFromRow(data as PlanItemRow);
}

export async function assignIdeaToDay(options: {
  ideaId: string;
  weekStart: string;
  dayOfWeek: number;
  notes?: string;
}): Promise<PlanResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const idea = await loadOwnedIdea(options.ideaId);
  if (!idea || !isOwnedBy(idea, ctx.user.id)) {
    return { ok: false, message: "Idea not found." };
  }
  let payload;
  try {
    payload = toPlanWritePayload({
      sessionUserId: ctx.user.id,
      brandId: ctx.brand?.id ?? idea.brand_id,
      ideaId: idea.id,
      weekStart: options.weekStart,
      dayOfWeek: options.dayOfWeek,
      notes: options.notes,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid plan." };
  }

  const existingWeek = await listPlanItemsForWeek(options.weekStart);
  if (existingWeek.error) return { ok: false, message: existingWeek.error };
  const onDay = existingWeek.items.filter((item) => item.day_of_week === options.dayOfWeek);
  if (!canAddToDay(onDay)) {
    return { ok: false, message: "That day already has enough planned ideas." };
  }
  if (existingWeek.items.some((item) => item.idea_id === idea.id)) {
    return { ok: false, message: "That idea is already on this week." };
  }

  const { data, error } = await ctx.supabase
    .from("content_plan_items")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  touchPlanner();
  return { ok: true, id: data.id };
}

export async function movePlanItem(planItemId: string, dayOfWeek: number): Promise<PlanResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedPlanItem(planItemId);
  if (!existing) return { ok: false, message: "Plan item not found." };
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { ok: false, message: "Choose a day in the week." };
  }
  const week = await listPlanItemsForWeek(existing.week_start);
  const onDay = week.items.filter((item) => item.day_of_week === dayOfWeek && item.id !== planItemId);
  if (!canAddToDay(onDay)) {
    return { ok: false, message: "That day already has enough planned ideas." };
  }
  const { error } = await ctx.supabase
    .from("content_plan_items")
    .update({ day_of_week: dayOfWeek })
    .eq("id", planItemId)
    .eq("user_id", ctx.user.id);
  if (error) return { ok: false, message: saveErrorMessage(error) };
  touchPlanner();
  return { ok: true, id: planItemId };
}

export async function updatePlanItemStatus(
  planItemId: string,
  status: PlanStatus,
): Promise<PlanResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  if (!isPlanStatus(status)) {
    return { ok: false, message: "Choose a valid plan status." };
  }
  const existing = await loadOwnedPlanItem(planItemId);
  if (!existing) return { ok: false, message: "Plan item not found." };
  const { error } = await ctx.supabase
    .from("content_plan_items")
    .update({ status })
    .eq("id", planItemId)
    .eq("user_id", ctx.user.id);
  if (error) return { ok: false, message: saveErrorMessage(error) };
  touchPlanner();
  return { ok: true, id: planItemId };
}

export async function removePlanItem(planItemId: string): Promise<PlanResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedPlanItem(planItemId);
  if (!existing) return { ok: false, message: "Plan item not found." };
  const { error } = await ctx.supabase
    .from("content_plan_items")
    .delete()
    .eq("id", planItemId)
    .eq("user_id", ctx.user.id);
  if (error) return { ok: false, message: saveErrorMessage(error) };
  touchPlanner();
  return { ok: true, id: planItemId };
}

export async function markPlanItemDrafted(planItemId: string, draftId: string): Promise<PlanResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedPlanItem(planItemId);
  if (!existing) return { ok: false, message: "Plan item not found." };
  const { error } = await ctx.supabase
    .from("content_plan_items")
    .update({ status: "drafted" satisfies PlanStatus, draft_id: draftId })
    .eq("id", planItemId)
    .eq("user_id", ctx.user.id);
  if (error) return { ok: false, message: saveErrorMessage(error) };
  touchPlanner();
  return { ok: true, id: planItemId };
}
