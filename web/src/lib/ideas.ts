import { isPlatform, type Platform } from "@/lib/brand";
import {
  formatsForPlatform,
  isContentFormat,
  type ContentFormat,
  type CreateFormState,
} from "@/lib/content";

export const DISCOVERY_OBJECTIVES = [
  "education",
  "engagement",
  "storytelling",
  "thought_leadership",
] as const;

export type DiscoveryObjective = (typeof DISCOVERY_OBJECTIVES)[number];

export const IDEA_STATUSES = ["saved", "used"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const MIN_IDEAS = 3;
export const MAX_IDEAS = 8;
export const DEFAULT_IDEAS = 5;

export type GeneratedIdea = {
  title: string;
  concept: string;
  why_relevant: string;
  angle: string;
  hook: string;
  format: ContentFormat;
  call_to_action: string;
  pillar: string;
  platform: Platform;
  status?: string;
  model?: string;
};

export type DiscoveryForm = {
  theme: string;
  platform: Platform | "";
  objective: DiscoveryObjective | "";
  count: number;
};

export type DiscoveryFieldErrors = Partial<Record<keyof DiscoveryForm | "form", string>>;

export type IdeaRow = {
  id: string;
  user_id: string;
  brand_id: string | null;
  title: string;
  concept: string;
  platform: string | null;
  format: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type IdeaRecord = GeneratedIdea & {
  id: string;
  user_id: string;
  brand_id: string | null;
  status: IdeaStatus;
  created_at: string;
  updated_at: string;
};

export type IdeaWritePayload = {
  user_id: string;
  brand_id: string | null;
  title: string;
  concept: string;
  platform: Platform | null;
  format: ContentFormat | null;
  status: IdeaStatus;
  metadata: {
    why_relevant: string;
    angle: string;
    hook: string;
    call_to_action: string;
    pillar: string;
  };
};

export function emptyDiscoveryForm(platforms: Platform[]): DiscoveryForm {
  return {
    theme: "",
    platform: platforms[0] ?? "",
    objective: "",
    count: DEFAULT_IDEAS,
  };
}

export function isDiscoveryObjective(value: string): value is DiscoveryObjective {
  return (DISCOVERY_OBJECTIVES as readonly string[]).includes(value);
}

export function isIdeaStatus(value: string): value is IdeaStatus {
  return (IDEA_STATUSES as readonly string[]).includes(value);
}

export function formatObjective(objective: DiscoveryObjective): string {
  return {
    education: "Education",
    engagement: "Engagement",
    storytelling: "Storytelling",
    thought_leadership: "Thought leadership",
  }[objective];
}

export function validateDiscoveryForm(
  form: DiscoveryForm,
  allowedPlatforms: Platform[],
): DiscoveryFieldErrors {
  const errors: DiscoveryFieldErrors = {};
  if (form.theme.trim().length > 400) {
    errors.theme = "Keep the theme under 400 characters.";
  }
  if (form.platform) {
    if (!isPlatform(form.platform)) {
      errors.platform = "Choose a supported platform.";
    } else if (allowedPlatforms.length > 0 && !allowedPlatforms.includes(form.platform)) {
      errors.platform = "That platform is not in your brand profile.";
    }
  }
  if (form.objective && !isDiscoveryObjective(form.objective)) {
    errors.objective = "Choose a supported objective.";
  }
  if (!Number.isInteger(form.count) || form.count < MIN_IDEAS || form.count > MAX_IDEAS) {
    errors.count = `Ask for between ${MIN_IDEAS} and ${MAX_IDEAS} ideas.`;
  }
  return errors;
}

export function parseGeneratedIdea(value: unknown): GeneratedIdea | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (typeof item.concept !== "string" || !item.concept.trim()) return null;
  if (typeof item.platform !== "string" || !isPlatform(item.platform)) return null;
  if (typeof item.format !== "string" || !isContentFormat(item.format)) return null;
  return {
    title: item.title.trim(),
    concept: item.concept.trim(),
    why_relevant: typeof item.why_relevant === "string" ? item.why_relevant.trim() : "",
    angle: typeof item.angle === "string" ? item.angle.trim() : "",
    hook: typeof item.hook === "string" ? item.hook.trim() : "",
    format: item.format,
    call_to_action: typeof item.call_to_action === "string" ? item.call_to_action.trim() : "",
    pillar: typeof item.pillar === "string" ? item.pillar.trim() : "",
    platform: item.platform,
    status: typeof item.status === "string" ? item.status : "suggestion",
    model: typeof item.model === "string" ? item.model : undefined,
  };
}

export function ideaFromRow(row: IdeaRow): IdeaRecord | null {
  const meta = row.metadata ?? {};
  const platform = row.platform && isPlatform(row.platform) ? row.platform : "linkedin";
  const format = row.format && isContentFormat(row.format) ? row.format : "text_post";
  if (!row.title?.trim() || !row.concept?.trim()) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    brand_id: row.brand_id,
    title: row.title,
    concept: row.concept,
    why_relevant: typeof meta.why_relevant === "string" ? meta.why_relevant : "",
    angle: typeof meta.angle === "string" ? meta.angle : "",
    hook: typeof meta.hook === "string" ? meta.hook : "",
    format,
    call_to_action: typeof meta.call_to_action === "string" ? meta.call_to_action : "",
    pillar: typeof meta.pillar === "string" ? meta.pillar : "",
    platform,
    status: isIdeaStatus(row.status) ? row.status : "saved",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toIdeaWritePayload(
  idea: GeneratedIdea,
  sessionUserId: string,
  brandId: string | null,
  status: IdeaStatus = "saved",
): IdeaWritePayload {
  if (!sessionUserId) {
    throw new Error("Authenticated user id is required.");
  }
  return {
    user_id: sessionUserId,
    brand_id: brandId,
    title: idea.title.trim(),
    concept: idea.concept.trim(),
    platform: idea.platform,
    format: idea.format,
    status,
    metadata: {
      why_relevant: idea.why_relevant,
      angle: idea.angle,
      hook: idea.hook,
      call_to_action: idea.call_to_action,
      pillar: idea.pillar,
    },
  };
}

export function ideaToCreateForm(idea: GeneratedIdea, allowedPlatforms: Platform[]): CreateFormState {
  const platform =
    idea.platform && allowedPlatforms.includes(idea.platform)
      ? idea.platform
      : (allowedPlatforms[0] ?? "linkedin");
  const formats = formatsForPlatform(platform);
  const format = idea.format && formats.includes(idea.format) ? idea.format : (formats[0] ?? "text_post");
  const keyPoints = [idea.concept, idea.why_relevant, idea.angle].filter(Boolean).join("\n\n");
  const extra = [
    idea.hook ? `Opening hook to consider: ${idea.hook}` : "",
    idea.pillar ? `Content pillar: ${idea.pillar}` : "",
    "This brief came from a saved idea. Do not invent statistics or personal stories.",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    platform,
    format,
    topic: idea.title.trim(),
    keyPoints,
    callToAction: idea.call_to_action,
    keywords: idea.pillar,
    extraInstructions: extra,
    pillarId: "",
    pillarName: "",
    pillarDescription: "",
  };
}

export function filterIdeas(
  ideas: IdeaRecord[],
  query: string,
  status: IdeaStatus | "all" = "all",
): IdeaRecord[] {
  const needle = query.trim().toLowerCase();
  return ideas.filter((idea) => {
    if (status !== "all" && idea.status !== status) return false;
    if (!needle) return true;
    const haystack = [idea.title, idea.concept, idea.pillar, idea.angle, idea.hook]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function ideasPageGate(options: {
  configured: boolean;
  hasUser: boolean;
  hasBrand: boolean;
}): "config" | "login" | "onboarding" | "ok" {
  if (!options.configured) return "config";
  if (!options.hasUser) return "login";
  if (!options.hasBrand) return "onboarding";
  return "ok";
}
