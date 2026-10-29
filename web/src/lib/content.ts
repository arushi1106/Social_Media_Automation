import { isPlatform, type BrandDraft, type Platform } from "@/lib/brand";

export const CONTENT_FORMATS = ["text_post", "caption", "carousel", "script"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const FORMATS_BY_PLATFORM: Record<Platform, ContentFormat[]> = {
  linkedin: ["text_post", "carousel", "script"],
  instagram: ["caption", "carousel", "script"],
};

export type Slide = { title: string; text: string };
export type ScriptParts = { hook: string; body: string; cta: string };

export type GeneratedContent = {
  title: string;
  body: string;
  hashtags: string[];
  slides: Slide[];
  script: ScriptParts | null;
  platform: Platform;
  format: ContentFormat;
  status: string;
  model?: string;
};

export type CreateFormState = {
  platform: Platform | "";
  format: ContentFormat | "";
  topic: string;
  keyPoints: string;
  callToAction: string;
  keywords: string;
  extraInstructions: string;
  pillarId: string;
  pillarName: string;
  pillarDescription: string;
};

export type CreateFieldErrors = Partial<Record<keyof CreateFormState | "form", string>>;

export type DraftInputs = CreateFormState;

export type DraftRow = {
  id: string;
  user_id: string;
  brand_id: string | null;
  platform: string;
  format: string;
  topic: string | null;
  title: string | null;
  body: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type DraftWritePayload = {
  user_id: string;
  brand_id: string | null;
  platform: Platform;
  format: ContentFormat;
  topic: string;
  title: string;
  body: string;
  status: "draft";
  metadata: {
    inputs: DraftInputs;
    content: GeneratedContent;
  };
};

export function resolveCreatePlatform(
  platforms: Platform[],
  preferredPlatform?: Platform | "",
): Platform {
  if (preferredPlatform && isPlatform(preferredPlatform) && platforms.includes(preferredPlatform)) {
    return preferredPlatform;
  }
  return platforms[0] ?? "linkedin";
}

export function emptyCreateForm(
  platforms: Platform[],
  preferredPlatform?: Platform | "",
): CreateFormState {
  const platform = resolveCreatePlatform(platforms, preferredPlatform);
  const formats = FORMATS_BY_PLATFORM[platform];
  return {
    platform,
    format: formats[0] ?? "text_post",
    topic: "",
    keyPoints: "",
    callToAction: "",
    keywords: "",
    extraInstructions: "",
    pillarId: "",
    pillarName: "",
    pillarDescription: "",
  };
}

export function hydrateCreateForm(
  stored: Partial<CreateFormState> | null,
  fallback: CreateFormState,
): CreateFormState {
  return {
    ...fallback,
    ...stored,
    pillarId: stored?.pillarId ?? "",
    pillarName: stored?.pillarName ?? "",
    pillarDescription: stored?.pillarDescription ?? "",
  };
}

export function formatsForPlatform(platform: Platform | ""): ContentFormat[] {
  if (!platform || !isPlatform(platform)) return [];
  return FORMATS_BY_PLATFORM[platform];
}

export function isContentFormat(value: string): value is ContentFormat {
  return (CONTENT_FORMATS as readonly string[]).includes(value);
}

export function formatLabel(format: ContentFormat): string {
  return {
    text_post: "Text post",
    caption: "Caption",
    carousel: "Carousel outline",
    script: "Short-video script",
  }[format];
}

export function validateCreateForm(
  form: CreateFormState,
  allowedPlatforms: Platform[],
): CreateFieldErrors {
  const errors: CreateFieldErrors = {};
  if (!form.platform || !isPlatform(form.platform)) {
    errors.platform = "Choose a platform.";
  } else if (allowedPlatforms.length > 0 && !allowedPlatforms.includes(form.platform)) {
    errors.platform = "That platform is not in your brand profile.";
  }
  const allowedFormats = formatsForPlatform(form.platform);
  if (!form.format || !isContentFormat(form.format)) {
    errors.format = "Choose a content format.";
  } else if (allowedFormats.length > 0 && !allowedFormats.includes(form.format)) {
    errors.format = "That format is not available for this platform.";
  }
  if (!form.topic.trim()) {
    errors.topic = "Enter a topic, idea, or brief.";
  } else if (form.topic.trim().length > 400) {
    errors.topic = "Keep the topic under 400 characters.";
  }
  return errors;
}

export function flattenGeneratedText(content: GeneratedContent): string {
  const parts: string[] = [];
  if (content.format === "carousel" && content.slides.length) {
    content.slides.forEach((slide, index) => {
      parts.push(`${index + 1}. ${slide.title ? `${slide.title}: ` : ""}${slide.text}`);
    });
  } else if (content.format === "script" && content.script) {
    parts.push(`Hook: ${content.script.hook}`, `Body: ${content.script.body}`, `CTA: ${content.script.cta}`);
  } else {
    parts.push(content.body);
  }
  if (content.hashtags.length) {
    parts.push(content.hashtags.join(" "));
  }
  return parts.join("\n\n").trim();
}

export function brandToApi(_brand: BrandDraft, brandId: string) {
  return { id: brandId };
}

export function toDraftWritePayload(
  content: GeneratedContent,
  inputs: DraftInputs,
  sessionUserId: string,
  brandId: string | null,
): DraftWritePayload {
  if (!sessionUserId) {
    throw new Error("Authenticated user id is required.");
  }
  return {
    user_id: sessionUserId,
    brand_id: brandId,
    platform: content.platform,
    format: content.format,
    topic: inputs.topic.trim(),
    title: content.title,
    body: flattenGeneratedText(content),
    status: "draft",
    metadata: { inputs, content },
  };
}

export function isOwnedBy(row: { user_id: string }, sessionUserId: string): boolean {
  return Boolean(sessionUserId) && row.user_id === sessionUserId;
}

export function withTrustedPillarSnapshot(
  inputs: CreateFormState,
  pillar: { id: string; name: string; description: string } | null,
): CreateFormState {
  if (!pillar) {
    if (!inputs.pillarId.trim()) {
      return { ...inputs, pillarId: "", pillarName: "", pillarDescription: "" };
    }
    return {
      ...inputs,
      pillarId: inputs.pillarId.trim(),
      pillarName: inputs.pillarName.trim(),
      pillarDescription: inputs.pillarDescription.trim(),
    };
  }
  return {
    ...inputs,
    pillarId: pillar.id,
    pillarName: pillar.name,
    pillarDescription: pillar.description,
  };
}

export function contentEquals(a: GeneratedContent, b: GeneratedContent): boolean {
  return JSON.stringify(normalizeContent(a)) === JSON.stringify(normalizeContent(b));
}

function normalizeContent(content: GeneratedContent): GeneratedContent {
  return {
    title: content.title.trim(),
    body: content.body.trim(),
    hashtags: content.hashtags.map((tag) => tag.trim()),
    slides: content.slides.map((slide) => ({
      title: slide.title.trim(),
      text: slide.text.trim(),
    })),
    script: content.script
      ? {
          hook: content.script.hook.trim(),
          body: content.script.body.trim(),
          cta: content.script.cta.trim(),
        }
      : null,
    platform: content.platform,
    format: content.format,
    status: content.status,
    model: content.model,
  };
}

export function contentFromRow(row: DraftRow): GeneratedContent | null {
  const meta = row.metadata ?? {};
  const stored = (meta.content ?? null) as GeneratedContent | null;
  if (stored && stored.body !== undefined) {
    return {
      title: stored.title || row.title || "Untitled",
      body: stored.body || row.body || "",
      hashtags: stored.hashtags ?? [],
      slides: stored.slides ?? [],
      script: stored.script ?? null,
      platform: (isPlatform(row.platform) ? row.platform : "linkedin") as Platform,
      format: (isContentFormat(row.format) ? row.format : "text_post") as ContentFormat,
      status: row.status,
    };
  }
  if (!row.body) return null;
  return {
    title: row.title || "Untitled",
    body: row.body,
    hashtags: [],
    slides: [],
    script: null,
    platform: (isPlatform(row.platform) ? row.platform : "linkedin") as Platform,
    format: (isContentFormat(row.format) ? row.format : "text_post") as ContentFormat,
    status: row.status,
  };
}

export function humanStatus(status: string): string {
  if (status === "ready") return "Ready";
  return "Draft";
}
