"use server";

import { revalidatePath } from "next/cache";
import { saveErrorMessage } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { isOwnedBy } from "@/lib/content";
import {
  MAX_PILLARS,
  canAddPillar,
  isOwnedPillar,
  toPillarWritePayload,
  validatePillarDraft,
  type ContentPillar,
  type PillarDraft,
} from "@/lib/pillars";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PILLAR_COLUMNS = "id, user_id, brand_id, name, description, created_at, updated_at";

export type PillarMutationResult =
  | { ok: true; id: string }
  | { ok: false; message: string; fieldErrors?: ReturnType<typeof validatePillarDraft> };

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
  if (!brand) {
    return { ok: false as const, error: "Save your brand before adding pillars." };
  }
  return { ok: true as const, supabase, user, brand };
}

function touch() {
  revalidatePath("/studio/brand");
  revalidatePath("/studio");
  revalidatePath("/studio/create");
  revalidatePath("/studio/strategy");
}

export async function listOwnedPillars(): Promise<{ pillars: ContentPillar[]; error: string | null }> {
  const ctx = await session();
  if (!ctx.ok) {
    return { pillars: [], error: ctx.error };
  }
  const { data, error } = await ctx.supabase
    .from("content_pillars")
    .select(PILLAR_COLUMNS)
    .eq("user_id", ctx.user.id)
    .eq("brand_id", ctx.brand.id)
    .order("created_at", { ascending: true });
  if (error) {
    return { pillars: [], error: saveErrorMessage(error) };
  }
  const rows = (data ?? []) as ContentPillar[];
  return {
    pillars: rows.filter((row) => isOwnedPillar(row, ctx.user.id) && isOwnedBy(ctx.brand, ctx.user.id)),
    error: null,
  };
}

export async function loadOwnedPillar(pillarId: string): Promise<ContentPillar | null> {
  const ctx = await session();
  if (!ctx.ok) return null;
  const id = pillarId.trim();
  if (!id) return null;
  const { data } = await ctx.supabase
    .from("content_pillars")
    .select(PILLAR_COLUMNS)
    .eq("id", id)
    .eq("user_id", ctx.user.id)
    .eq("brand_id", ctx.brand.id)
    .maybeSingle();
  const row = data as ContentPillar | null;
  if (!row || !isOwnedPillar(row, ctx.user.id) || row.brand_id !== ctx.brand.id) return null;
  return row;
}

export async function createStudioPillar(draft: PillarDraft): Promise<PillarMutationResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const { pillars } = await listOwnedPillars();
  if (!canAddPillar(pillars.length)) {
    return {
      ok: false,
      message: `You can save up to ${MAX_PILLARS} pillars.`,
      fieldErrors: { form: `You can save up to ${MAX_PILLARS} pillars. Delete one to add another.` },
    };
  }
  const fieldErrors = validatePillarDraft(draft, pillars);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  const payload = toPillarWritePayload(draft, ctx.user.id, ctx.brand.id);
  const { data, error } = await ctx.supabase.from("content_pillars").insert(payload).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, message: "You already have a pillar with that name.", fieldErrors: { name: "You already have a pillar with that name." } };
    }
    return { ok: false, message: saveErrorMessage(error) };
  }
  touch();
  return { ok: true, id: data.id };
}

export async function updateStudioPillar(
  pillarId: string,
  draft: PillarDraft,
): Promise<PillarMutationResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedPillar(pillarId);
  if (!existing) {
    return { ok: false, message: "Pillar not found." };
  }
  const { pillars } = await listOwnedPillars();
  const fieldErrors = validatePillarDraft(draft, pillars, { editingId: pillarId });
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  const payload = toPillarWritePayload(draft, ctx.user.id, ctx.brand.id);
  const { error } = await ctx.supabase
    .from("content_pillars")
    .update({ name: payload.name, description: payload.description })
    .eq("id", pillarId)
    .eq("user_id", ctx.user.id);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "You already have a pillar with that name.", fieldErrors: { name: "You already have a pillar with that name." } };
    }
    return { ok: false, message: saveErrorMessage(error) };
  }
  touch();
  return { ok: true, id: pillarId };
}

export async function deleteStudioPillar(pillarId: string): Promise<PillarMutationResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedPillar(pillarId);
  if (!existing) {
    return { ok: false, message: "Pillar not found." };
  }
  const { error } = await ctx.supabase
    .from("content_pillars")
    .delete()
    .eq("id", pillarId)
    .eq("user_id", ctx.user.id);
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  touch();
  return { ok: true, id: pillarId };
}
