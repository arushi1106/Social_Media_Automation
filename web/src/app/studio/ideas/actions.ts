"use server";

import { revalidatePath } from "next/cache";
import { saveErrorMessage } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { isOwnedBy } from "@/lib/content";
import {
  ideaFromRow,
  toIdeaWritePayload,
  type GeneratedIdea,
  type IdeaRecord,
  type IdeaRow,
  type IdeaStatus,
} from "@/lib/ideas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const IDEA_COLUMNS =
  "id, user_id, brand_id, title, concept, platform, format, status, metadata, created_at, updated_at";

export type IdeaResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

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

export async function saveStudioIdea(idea: GeneratedIdea, projectId = ""): Promise<IdeaResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const payload = toIdeaWritePayload(idea, ctx.user.id, ctx.brand?.id ?? null, "saved", projectId);
  const { data, error } = await ctx.supabase.from("content_ideas").insert(payload).select("id").single();
  if (error || !data) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  revalidatePath("/studio/ideas");
  revalidatePath("/studio/planner");
  revalidatePath("/studio/projects");
  return { ok: true, id: data.id };
}

export async function updateStudioIdea(
  ideaId: string,
  fields: { title: string; concept: string },
): Promise<IdeaResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const title = fields.title.trim();
  const concept = fields.concept.trim();
  if (!title || !concept) {
    return { ok: false, message: "Title and concept are required." };
  }
  const existing = await loadOwnedIdea(ideaId);
  if (!existing) {
    return { ok: false, message: "Idea not found." };
  }
  const { error } = await ctx.supabase
    .from("content_ideas")
    .update({ title, concept })
    .eq("id", ideaId)
    .eq("user_id", ctx.user.id);
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  revalidatePath("/studio/ideas");
  revalidatePath("/studio/planner");
  return { ok: true, id: ideaId };
}

export async function deleteStudioIdea(ideaId: string): Promise<IdeaResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedIdea(ideaId);
  if (!existing) {
    return { ok: false, message: "Idea not found." };
  }
  const { error } = await ctx.supabase.from("content_ideas").delete().eq("id", ideaId).eq("user_id", ctx.user.id);
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  revalidatePath("/studio/ideas");
  revalidatePath("/studio/planner");
  return { ok: true, id: ideaId };
}

export async function markIdeaUsed(ideaId: string): Promise<IdeaResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedIdea(ideaId);
  if (!existing) {
    return { ok: false, message: "Idea not found." };
  }
  const { error } = await ctx.supabase
    .from("content_ideas")
    .update({ status: "used" satisfies IdeaStatus })
    .eq("id", ideaId)
    .eq("user_id", ctx.user.id);
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  revalidatePath("/studio/ideas");
  revalidatePath("/studio/planner");
  return { ok: true, id: ideaId };
}

export async function loadOwnedIdea(ideaId: string): Promise<IdeaRecord | null> {
  const ctx = await session();
  if (!ctx.ok) return null;
  const { data } = await ctx.supabase
    .from("content_ideas")
    .select(IDEA_COLUMNS)
    .eq("id", ideaId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!data || !isOwnedBy(data, ctx.user.id)) return null;
  return ideaFromRow(data as IdeaRow);
}

export async function listOwnedIdeas(): Promise<{ ideas: IdeaRecord[]; error: string | null }> {
  const ctx = await session();
  if (!ctx.ok) {
    return { ideas: [], error: ctx.error };
  }
  const { data, error } = await ctx.supabase
    .from("content_ideas")
    .select(IDEA_COLUMNS)
    .eq("user_id", ctx.user.id)
    .order("updated_at", { ascending: false });
  if (error) {
    return { ideas: [], error: saveErrorMessage(error) };
  }
  const rows = (data ?? []) as IdeaRow[];
  return {
    ideas: rows.filter((row) => isOwnedBy(row, ctx.user.id)).map(ideaFromRow).filter((item): item is IdeaRecord => item !== null),
    error: null,
  };
}
