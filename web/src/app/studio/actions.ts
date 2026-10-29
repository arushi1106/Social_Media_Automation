"use server";

import { revalidatePath } from "next/cache";
import { apiBaseUrl } from "@/lib/env";
import { brandFromRow, isPlatform, saveErrorMessage } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import {
  brandToApi,
  contentFromRow,
  emptyCreateForm,
  hydrateCreateForm,
  isOwnedBy,
  toDraftWritePayload,
  validateCreateForm,
  withTrustedPillarSnapshot,
  type CreateFormState,
  type DraftRow,
  type GeneratedContent,
} from "@/lib/content";
import { duplicateDraftTitle } from "@/lib/library";
import { loadOwnedPillar } from "@/app/studio/brand/pillars-actions";
import {
  MISSING_PILLAR_MESSAGE,
  toApiPillar,
  type TrustedPillarContext,
} from "@/lib/pillars";
import { bearerAuthorization } from "@/lib/api-auth";
import {
  parseGeneratedIdea,
  validateDiscoveryForm,
  type DiscoveryForm,
  type GeneratedIdea,
} from "@/lib/ideas";
import { parseQualityReview, type QualityReview } from "@/lib/quality";
import {
  isRefineAction,
  sourceDraftPayload,
  validateRefineAction,
  validateRepurposeTarget,
  type RefineAction,
} from "@/lib/refine";
import { isVariationAngle, parseHookOptions, type HookOption, type VariationAngle } from "@/lib/variations";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type GenerateResult =
  | { ok: true; content: GeneratedContent }
  | { ok: false; message: string; fieldErrors?: ReturnType<typeof validateCreateForm> };

export type DraftResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

export type VariationsResult =
  | { ok: true; alternatives: GeneratedContent[] }
  | { ok: false; message: string };

export type HooksResult = { ok: true; hooks: HookOption[] } | { ok: false; message: string };

export type DiscoverResult =
  | { ok: true; ideas: GeneratedIdea[]; disclaimer: string }
  | { ok: false; message: string; fieldErrors?: ReturnType<typeof validateDiscoveryForm> };

export type ReviewResult =
  | { ok: true; review: QualityReview }
  | { ok: false; message: string };

async function sessionContext() {
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    ok: true as const,
    supabase,
    user,
    brand,
    accessToken: session?.access_token ?? null,
  };
}

export async function generateStudioDraft(form: CreateFormState): Promise<GenerateResult> {
  const ctx = await sessionContext();
  if (!ctx.ok) {
    return { ok: false, message: ctx.error };
  }
  if (!ctx.brand) {
    return { ok: false, message: "Set up your brand before generating drafts." };
  }
  const brand = brandFromRow(ctx.brand);
  const fieldErrors = validateCreateForm(form, brand.platforms);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  const pillarResult = await trustedPillarForGenerate(form.pillarId);
  if (!pillarResult.ok) {
    return pillarResult;
  }
  if (!ctx.accessToken) {
    return { ok: false, message: "Your session expired. Sign in again." };
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/v1/content/generate`, {
      method: "POST",
      headers: {
        ...bearerAuthorization(ctx.accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform: form.platform,
        format: form.format,
        topic: form.topic.trim(),
        key_points: form.keyPoints,
        call_to_action: form.callToAction,
        keywords: form.keywords,
        extra_instructions: form.extraInstructions,
        brand: brandToApi(brand, ctx.brand.id),
        pillar: toApiPillar(pillarResult.pillar),
      }),
    });
  } catch {
    return {
      ok: false,
      message: "Could not reach the writing API. Start make dev-api on port 8000.",
    };
  }

  if (!response.ok) {
    let detail = "Draft generation failed.";
    try {
      const payload = (await response.json()) as { detail?: string };
      if (typeof payload.detail === "string") detail = payload.detail;
    } catch {
      /* keep default */
    }
    return { ok: false, message: detail };
  }

  const payload = (await response.json()) as GeneratedContent;
  if (!payload?.body && !payload?.slides?.length && !payload?.script) {
    return { ok: false, message: "The writing service returned an empty draft. Try again." };
  }
  return { ok: true, content: payload };
}

export async function discoverStudioIdeas(form: DiscoveryForm): Promise<DiscoverResult> {
  const ctx = await sessionContext();
  if (!ctx.ok) {
    return { ok: false, message: ctx.error };
  }
  if (!ctx.brand) {
    return { ok: false, message: "Set up your brand before generating ideas." };
  }
  const brand = brandFromRow(ctx.brand);
  const fieldErrors = validateDiscoveryForm(form, brand.platforms);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  const result = await postStudioContent("/v1/content/ideas", {
    count: form.count,
    theme: form.theme.trim(),
    platform: form.platform,
    objective: form.objective,
  });
  if (!result.ok) return result;
  const payload = result.payload as { ideas?: unknown[]; disclaimer?: string };
  const ideas = Array.isArray(payload.ideas)
    ? payload.ideas.map(parseGeneratedIdea).filter((item): item is GeneratedIdea => item !== null)
    : [];
  if (ideas.length !== form.count) {
    return { ok: false, message: "The writing service did not return a complete set of ideas. Try again." };
  }
  return {
    ok: true,
    ideas,
    disclaimer:
      typeof payload.disclaimer === "string"
        ? payload.disclaimer
        : "AI-generated suggestions, not proven performance predictions.",
  };
}

export async function reviewStudioDraft(content: GeneratedContent): Promise<ReviewResult> {
  const result = await postStudioContent("/v1/content/review", {
    platform: content.platform,
    format: content.format,
    source: sourceDraftPayload(content),
  });
  if (!result.ok) return result;
  const parsed = parseQualityReview(result.payload);
  if (!parsed) {
    return { ok: false, message: "The review was incomplete. Try again." };
  }
  return { ok: true, review: parsed };
}

async function trustedPillarForGenerate(
  pillarId: string,
): Promise<
  | { ok: true; pillar: TrustedPillarContext | null }
  | { ok: false; message: string; fieldErrors: { pillarId: string } }
> {
  const id = pillarId.trim();
  if (!id) {
    return { ok: true, pillar: null };
  }
  const row = await loadOwnedPillar(id);
  if (!row) {
    return {
      ok: false,
      message: MISSING_PILLAR_MESSAGE,
      fieldErrors: { pillarId: "That pillar is no longer available." },
    };
  }
  return {
    ok: true,
    pillar: { id: row.id, name: row.name, description: row.description },
  };
}

async function pillarPayloadForRewrite(inputs?: CreateFormState) {
  const id = inputs?.pillarId?.trim() ?? "";
  if (!id) return null;
  const live = await loadOwnedPillar(id);
  if (live) {
    return toApiPillar({ id: live.id, name: live.name, description: live.description });
  }
  return null;
}

async function persistableInputs(inputs: CreateFormState): Promise<CreateFormState> {
  const id = inputs.pillarId.trim();
  if (!id) {
    return withTrustedPillarSnapshot(inputs, null);
  }
  const live = await loadOwnedPillar(id);
  if (live) {
    return withTrustedPillarSnapshot(inputs, {
      id: live.id,
      name: live.name,
      description: live.description,
    });
  }
  return withTrustedPillarSnapshot(inputs, null);
}

async function postStudioContent(
  path: string,
  body: unknown,
): Promise<{ ok: true; payload: unknown } | { ok: false; message: string }> {
  const ctx = await sessionContext();
  if (!ctx.ok) {
    return { ok: false, message: ctx.error };
  }
  if (!ctx.brand) {
    return { ok: false, message: "Set up your brand before generating drafts." };
  }
  if (!ctx.accessToken) {
    return { ok: false, message: "Your session expired. Sign in again." };
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        ...bearerAuthorization(ctx.accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...((body as object) ?? {}),
        brand: brandToApi(brandFromRow(ctx.brand), ctx.brand.id),
      }),
    });
  } catch {
    return {
      ok: false,
      message: "Could not reach the writing API. Start make dev-api on port 8000.",
    };
  }

  if (!response.ok) {
    let detail = "Draft generation failed.";
    try {
      const payload = (await response.json()) as { detail?: string };
      if (typeof payload.detail === "string") detail = payload.detail;
    } catch {
      /* keep default */
    }
    return { ok: false, message: detail };
  }

  return { ok: true, payload: await response.json() };
}

function asGeneratedContent(payload: unknown): GeneratedContent | null {
  const content = payload as GeneratedContent;
  if (!content?.title) return null;
  if (!content.body && !content.slides?.length && !content.script) return null;
  return content;
}

export async function refineStudioDraft(
  content: GeneratedContent,
  action: RefineAction | string,
  customInstructions: string,
  inputs?: CreateFormState,
): Promise<GenerateResult> {
  const fieldErrors = validateRefineAction(action, customInstructions);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: fieldErrors.customInstructions || fieldErrors.action || "Invalid rewrite." };
  }
  if (!isRefineAction(action)) {
    return { ok: false, message: "Choose a rewrite action." };
  }
  const result = await postStudioContent("/v1/content/refine", {
    platform: content.platform,
    format: content.format,
    source: sourceDraftPayload(content),
    action,
    custom_instructions: customInstructions.trim(),
    pillar: await pillarPayloadForRewrite(inputs),
  });
  if (!result.ok) return result;
  const parsed = asGeneratedContent(result.payload);
  if (!parsed) {
    return { ok: false, message: "The writing service returned an empty draft. Try again." };
  }
  return { ok: true, content: parsed };
}

export async function generateStudioVariations(
  content: GeneratedContent,
  customInstructions: string,
  inputs?: CreateFormState,
  angle: VariationAngle | string = "distinct",
): Promise<VariationsResult> {
  if (customInstructions.trim().length > 2000) {
    return { ok: false, message: "Keep custom instructions under 2000 characters." };
  }
  if (!isVariationAngle(angle)) {
    return { ok: false, message: "Choose a supported variation angle." };
  }
  const result = await postStudioContent("/v1/content/variations", {
    platform: content.platform,
    format: content.format,
    source: sourceDraftPayload(content),
    custom_instructions: customInstructions.trim(),
    pillar: await pillarPayloadForRewrite(inputs),
    angle,
    topic: inputs?.topic?.trim() ?? "",
  });
  if (!result.ok) return result;
  const payload = result.payload as { alternatives?: unknown[] };
  const alternatives = Array.isArray(payload.alternatives)
    ? payload.alternatives.map(asGeneratedContent).filter((item): item is GeneratedContent => item !== null)
    : [];
  if (alternatives.length !== 3) {
    return { ok: false, message: "The writing service did not return three usable alternatives. Try again." };
  }
  return { ok: true, alternatives };
}

export async function generateStudioHooks(
  content: GeneratedContent,
  customInstructions: string,
  inputs?: CreateFormState,
): Promise<HooksResult> {
  if (customInstructions.trim().length > 2000) {
    return { ok: false, message: "Keep custom instructions under 2000 characters." };
  }
  const result = await postStudioContent("/v1/content/hooks", {
    platform: content.platform,
    format: content.format,
    source: sourceDraftPayload(content),
    custom_instructions: customInstructions.trim(),
    pillar: await pillarPayloadForRewrite(inputs),
    topic: inputs?.topic?.trim() ?? "",
  });
  if (!result.ok) return result;
  const hooks = parseHookOptions(result.payload);
  if (hooks.length !== 4) {
    return { ok: false, message: "The writing service did not return four usable hooks. Try again." };
  }
  return { ok: true, hooks };
}

export async function repurposeStudioDraft(
  content: GeneratedContent,
  targetPlatform: string,
  targetFormat: string,
  customInstructions: string,
  inputs?: CreateFormState,
): Promise<GenerateResult> {
  const fieldErrors = validateRepurposeTarget(content, targetPlatform, targetFormat);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: fieldErrors.targetFormat || fieldErrors.targetPlatform || "Choose a supported target.",
    };
  }
  const result = await postStudioContent("/v1/content/repurpose", {
    source_platform: content.platform,
    source_format: content.format,
    target_platform: targetPlatform,
    target_format: targetFormat,
    source: sourceDraftPayload(content),
    custom_instructions: customInstructions.trim(),
    pillar: await pillarPayloadForRewrite(inputs),
  });
  if (!result.ok) return result;
  const parsed = asGeneratedContent(result.payload);
  if (!parsed) {
    return { ok: false, message: "The writing service returned an empty draft. Try again." };
  }
  return { ok: true, content: parsed };
}

export async function saveStudioDraft(
  content: GeneratedContent,
  inputs: CreateFormState,
): Promise<DraftResult> {
  const ctx = await sessionContext();
  if (!ctx.ok) {
    return { ok: false, message: ctx.error };
  }

  const payload = toDraftWritePayload(
    content,
    await persistableInputs(inputs),
    ctx.user.id,
    ctx.brand?.id ?? null,
  );
  const { data, error } = await ctx.supabase
    .from("content_items")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  revalidatePath("/studio/drafts");
  revalidatePath(`/studio/drafts/${data.id}`);
  revalidatePath("/studio/strategy");
  return { ok: true, id: data.id };
}

export async function updateStudioDraft(
  draftId: string,
  content: GeneratedContent,
  inputs: CreateFormState,
): Promise<DraftResult> {
  const ctx = await sessionContext();
  if (!ctx.ok) {
    return { ok: false, message: ctx.error };
  }
  const { data: existing, error: loadError } = await ctx.supabase
    .from("content_items")
    .select("id, user_id")
    .eq("id", draftId)
    .maybeSingle();
  if (loadError) {
    return { ok: false, message: saveErrorMessage(loadError) };
  }
  if (!existing || !isOwnedBy(existing, ctx.user.id)) {
    return { ok: false, message: "Draft not found." };
  }
  const payload = toDraftWritePayload(
    content,
    await persistableInputs(inputs),
    ctx.user.id,
    ctx.brand?.id ?? null,
  );
  const { error } = await ctx.supabase
    .from("content_items")
    .update({
      platform: payload.platform,
      format: payload.format,
      topic: payload.topic,
      title: payload.title,
      body: payload.body,
      metadata: payload.metadata,
    })
    .eq("id", draftId)
    .eq("user_id", ctx.user.id);
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  revalidatePath("/studio/drafts");
  revalidatePath(`/studio/drafts/${draftId}`);
  revalidatePath("/studio/strategy");
  return { ok: true, id: draftId };
}

export async function loadOwnedDraft(draftId: string): Promise<DraftRow | null> {
  const ctx = await sessionContext();
  if (!ctx.ok) {
    return null;
  }
  const { data } = await ctx.supabase
    .from("content_items")
    .select(
      "id, user_id, brand_id, platform, format, topic, title, body, status, metadata, created_at, updated_at",
    )
    .eq("id", draftId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!data || !isOwnedBy(data, ctx.user.id)) {
    return null;
  }
  return data as DraftRow;
}

export async function listOwnedDrafts(): Promise<{ drafts: DraftRow[]; error: string | null }> {
  const ctx = await sessionContext();
  if (!ctx.ok) {
    return { drafts: [], error: ctx.error };
  }
  const { data, error } = await ctx.supabase
    .from("content_items")
    .select(
      "id, user_id, brand_id, platform, format, topic, title, body, status, metadata, created_at, updated_at",
    )
    .eq("user_id", ctx.user.id)
    .order("updated_at", { ascending: false });
  if (error) {
    return { drafts: [], error: saveErrorMessage(error) };
  }
  const rows = (data ?? []) as DraftRow[];
  return { drafts: rows.filter((row) => isOwnedBy(row, ctx.user.id)), error: null };
}

export async function duplicateStudioDraft(draftId: string): Promise<DraftResult> {
  const ctx = await sessionContext();
  if (!ctx.ok) {
    return { ok: false, message: ctx.error };
  }
  const source = await loadOwnedDraft(draftId);
  if (!source || !isOwnedBy(source, ctx.user.id)) {
    return { ok: false, message: "Draft not found." };
  }
  const content = contentFromRow(source);
  if (!content) {
    return { ok: false, message: "That draft has no copy to duplicate." };
  }
  const fallback = emptyCreateForm(
    isPlatform(source.platform) ? [source.platform] : ["linkedin"],
  );
  const stored = (source.metadata?.inputs ?? null) as Partial<CreateFormState> | null;
  const inputs = hydrateCreateForm(stored, fallback);
  const copy = {
    ...content,
    title: duplicateDraftTitle(content.title),
    status: "draft",
  };
  const payload = toDraftWritePayload(
    copy,
    await persistableInputs(inputs),
    ctx.user.id,
    ctx.brand?.id ?? null,
  );
  const { data, error } = await ctx.supabase.from("content_items").insert(payload).select("id").single();
  if (error || !data) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  revalidatePath("/studio/drafts");
  revalidatePath(`/studio/drafts/${data.id}`);
  revalidatePath("/studio/strategy");
  return { ok: true, id: data.id };
}

export async function deleteStudioDraft(draftId: string): Promise<DraftResult> {
  const ctx = await sessionContext();
  if (!ctx.ok) {
    return { ok: false, message: ctx.error };
  }
  const existing = await loadOwnedDraft(draftId);
  if (!existing || !isOwnedBy(existing, ctx.user.id)) {
    return { ok: false, message: "Draft not found." };
  }
  const { error } = await ctx.supabase
    .from("content_items")
    .delete()
    .eq("id", draftId)
    .eq("user_id", ctx.user.id);
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }
  revalidatePath("/studio/drafts");
  revalidatePath("/studio/strategy");
  return { ok: true, id: draftId };
}
