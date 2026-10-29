"use server";

import { revalidatePath } from "next/cache";
import { saveErrorMessage } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { isOwnedBy } from "@/lib/content";
import { isPlatform, type Platform } from "@/lib/brand";
import {
  MAX_PROJECTS,
  canAddProject,
  isOwnedProject,
  toProjectWritePayload,
  validateProjectDraft,
  type ContentProject,
  type ProjectDraft,
} from "@/lib/projects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PROJECT_COLUMNS =
  "id, user_id, brand_id, name, objective, audience, core_message, offer, desired_action, pillar_id, platforms, tone, plan_start, plan_end, created_at, updated_at";

export type ProjectMutationResult =
  | { ok: true; id: string }
  | { ok: false; message: string; fieldErrors?: ReturnType<typeof validateProjectDraft> };

type ProjectRow = Omit<ContentProject, "platforms"> & { platforms: string[] | null };

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false as const, error: "Supabase is not configured." };
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) return { ok: false as const, error: "Supabase is not configured." };
  if (!user) return { ok: false as const, error: "Your session expired. Sign in again." };
  if (!brand) return { ok: false as const, error: "Save your brand before managing projects." };
  return { ok: true as const, supabase, user, brand };
}

function touch() {
  revalidatePath("/studio/projects");
  revalidatePath("/studio");
  revalidatePath("/studio/create");
}

function asProject(row: ProjectRow): ContentProject | null {
  if (!row?.id) return null;
  return {
    ...row,
    platforms: (row.platforms ?? []).filter((item): item is Platform => isPlatform(item)),
  };
}

export async function listOwnedProjects(): Promise<{ projects: ContentProject[]; error: string | null }> {
  const ctx = await session();
  if (!ctx.ok) return { projects: [], error: ctx.error };
  const { data, error } = await ctx.supabase
    .from("content_projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", ctx.user.id)
    .eq("brand_id", ctx.brand.id)
    .order("updated_at", { ascending: false });
  if (error) return { projects: [], error: saveErrorMessage(error) };
  return {
    projects: ((data ?? []) as ProjectRow[])
      .map(asProject)
      .filter((row): row is ContentProject => Boolean(row && isOwnedProject(row, ctx.user.id) && isOwnedBy(ctx.brand, ctx.user.id))),
    error: null,
  };
}

export async function loadOwnedProject(projectId: string): Promise<ContentProject | null> {
  const ctx = await session();
  if (!ctx.ok) return null;
  const id = projectId.trim();
  if (!id) return null;
  const { data } = await ctx.supabase
    .from("content_projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .eq("user_id", ctx.user.id)
    .eq("brand_id", ctx.brand.id)
    .maybeSingle();
  const mapped = data ? asProject(data as ProjectRow) : null;
  if (!mapped || !isOwnedProject(mapped, ctx.user.id)) return null;
  return mapped;
}

export async function createStudioProject(draft: ProjectDraft): Promise<ProjectMutationResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const { projects } = await listOwnedProjects();
  if (!canAddProject(projects.length)) {
    return { ok: false, message: `You can save up to ${MAX_PROJECTS} projects.` };
  }
  const fieldErrors = validateProjectDraft(draft);
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  let payload;
  try {
    payload = toProjectWritePayload(draft, ctx.user.id, ctx.brand.id);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save that project." };
  }
  const { data, error } = await ctx.supabase.from("content_projects").insert(payload).select("id").single();
  if (error) return { ok: false, message: saveErrorMessage(error) };
  touch();
  return { ok: true, id: data.id as string };
}

export async function updateStudioProject(projectId: string, draft: ProjectDraft): Promise<ProjectMutationResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedProject(projectId);
  if (!existing) return { ok: false, message: "That project is no longer available." };
  const fieldErrors = validateProjectDraft(draft);
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  let payload;
  try {
    payload = toProjectWritePayload(draft, ctx.user.id, ctx.brand.id);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update that project." };
  }
  const { error } = await ctx.supabase
    .from("content_projects")
    .update({
      name: payload.name,
      objective: payload.objective,
      audience: payload.audience,
      core_message: payload.core_message,
      offer: payload.offer,
      desired_action: payload.desired_action,
      pillar_id: payload.pillar_id,
      platforms: payload.platforms,
      tone: payload.tone,
      plan_start: payload.plan_start,
      plan_end: payload.plan_end,
    })
    .eq("id", existing.id)
    .eq("user_id", ctx.user.id);
  if (error) return { ok: false, message: saveErrorMessage(error) };
  touch();
  revalidatePath(`/studio/projects/${existing.id}`);
  return { ok: true, id: existing.id };
}

export async function deleteStudioProject(projectId: string): Promise<ProjectMutationResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedProject(projectId);
  if (!existing) return { ok: false, message: "That project is no longer available." };
  const { error } = await ctx.supabase.from("content_projects").delete().eq("id", existing.id).eq("user_id", ctx.user.id);
  if (error) return { ok: false, message: saveErrorMessage(error) };
  touch();
  return { ok: true, id: existing.id };
}
