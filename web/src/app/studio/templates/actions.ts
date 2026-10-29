"use server";

import { revalidatePath } from "next/cache";
import { saveErrorMessage } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { isOwnedBy } from "@/lib/content";
import {
  MAX_TEMPLATES,
  canAddTemplate,
  isOwnedTemplate,
  parseTemplateStructure,
  toTemplateWritePayload,
  validateTemplateDraft,
  type ContentTemplate,
  isTemplateCategory,
  type TemplateDraft,
} from "@/lib/templates";
import { isContentFormat } from "@/lib/content";
import { isPlatform } from "@/lib/brand";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const TEMPLATE_COLUMNS =
  "id, user_id, brand_id, name, description, category, content_format, platform, structure, created_at, updated_at";

export type TemplateMutationResult =
  | { ok: true; id: string }
  | { ok: false; message: string; fieldErrors?: ReturnType<typeof validateTemplateDraft> };

type TemplateRow = {
  id: string;
  user_id: string;
  brand_id: string;
  name: string;
  description: string;
  category: string;
  content_format: string;
  platform: string | null;
  structure: unknown;
  created_at: string;
  updated_at: string;
};

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
    return { ok: false as const, error: "Save your brand before managing templates." };
  }
  return { ok: true as const, supabase, user, brand };
}

function touch() {
  revalidatePath("/studio/templates");
  revalidatePath("/studio/create");
  revalidatePath("/studio");
}

function asTemplate(row: TemplateRow): ContentTemplate | null {
  if (!isContentFormat(row.content_format) || !isTemplateCategory(row.category)) return null;
  return {
    id: row.id,
    source: "user",
    user_id: row.user_id,
    brand_id: row.brand_id,
    name: row.name,
    description: row.description,
    category: row.category,
    content_format: row.content_format,
    platform: row.platform && isPlatform(row.platform) ? row.platform : "",
    structure: parseTemplateStructure(row.structure),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listOwnedTemplates(): Promise<{ templates: ContentTemplate[]; error: string | null }> {
  const ctx = await session();
  if (!ctx.ok) {
    return { templates: [], error: ctx.error };
  }
  const { data, error } = await ctx.supabase
    .from("content_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("user_id", ctx.user.id)
    .eq("brand_id", ctx.brand.id)
    .order("updated_at", { ascending: false });
  if (error) {
    return { templates: [], error: saveErrorMessage(error) };
  }
  const rows = (data ?? []) as TemplateRow[];
  return {
    templates: rows
      .map(asTemplate)
      .filter((row): row is ContentTemplate => Boolean(row && isOwnedTemplate(row, ctx.user.id) && isOwnedBy(ctx.brand, ctx.user.id))),
    error: null,
  };
}

export async function loadOwnedTemplate(templateId: string): Promise<ContentTemplate | null> {
  const ctx = await session();
  if (!ctx.ok) return null;
  const id = templateId.trim();
  if (!id) return null;
  const { data } = await ctx.supabase
    .from("content_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", id)
    .eq("user_id", ctx.user.id)
    .eq("brand_id", ctx.brand.id)
    .maybeSingle();
  const mapped = data ? asTemplate(data as TemplateRow) : null;
  if (!mapped || !isOwnedTemplate(mapped, ctx.user.id) || mapped.brand_id !== ctx.brand.id) return null;
  return mapped;
}

export async function createStudioTemplate(draft: TemplateDraft): Promise<TemplateMutationResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const { templates } = await listOwnedTemplates();
  if (!canAddTemplate(templates.length)) {
    return {
      ok: false,
      message: `You can save up to ${MAX_TEMPLATES} templates.`,
      fieldErrors: { form: `You can save up to ${MAX_TEMPLATES} templates. Delete one to add another.` },
    };
  }
  const fieldErrors = validateTemplateDraft(draft, templates);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  let payload;
  try {
    payload = toTemplateWritePayload(draft, ctx.user.id, ctx.brand.id);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save that template." };
  }
  const { data, error } = await ctx.supabase.from("content_templates").insert(payload).select("id").single();
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  touch();
  return { ok: true, id: data.id as string };
}

export async function updateStudioTemplate(
  templateId: string,
  draft: TemplateDraft,
): Promise<TemplateMutationResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedTemplate(templateId);
  if (!existing) {
    return { ok: false, message: "That template is no longer available." };
  }
  const { templates } = await listOwnedTemplates();
  const fieldErrors = validateTemplateDraft(draft, templates, { editingId: existing.id });
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  let payload;
  try {
    payload = toTemplateWritePayload(draft, ctx.user.id, ctx.brand.id);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update that template." };
  }
  const { error } = await ctx.supabase
    .from("content_templates")
    .update({
      name: payload.name,
      description: payload.description,
      category: payload.category,
      content_format: payload.content_format,
      platform: payload.platform,
      structure: payload.structure,
    })
    .eq("id", existing.id)
    .eq("user_id", ctx.user.id);
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  touch();
  return { ok: true, id: existing.id };
}

export async function deleteStudioTemplate(templateId: string): Promise<TemplateMutationResult> {
  const ctx = await session();
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const existing = await loadOwnedTemplate(templateId);
  if (!existing) {
    return { ok: false, message: "That template is no longer available." };
  }
  const { error } = await ctx.supabase
    .from("content_templates")
    .delete()
    .eq("id", existing.id)
    .eq("user_id", ctx.user.id);
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  touch();
  return { ok: true, id: existing.id };
}
