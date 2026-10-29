export const TONES = [
  "professional",
  "conversational",
  "educational",
  "witty",
  "bold",
  "inspirational",
  "custom",
] as const;

export const PLATFORMS = ["linkedin", "instagram"] as const;

export const GOALS = [
  "grow_audience",
  "build_authority",
  "educate",
  "increase_engagement",
  "share_experiences",
  "promote_business",
] as const;

export const NICHE_EXAMPLES = [
  "Technology",
  "AI",
  "Career development",
  "Fashion",
  "Fitness",
  "Lifestyle",
  "Entrepreneurship",
] as const;

export type Tone = (typeof TONES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type Goal = (typeof GOALS)[number];

export type VoicePreferences = {
  tone: Tone;
  customTone?: string;
  writingStyle?: string;
  avoid?: string;
  preferredPlatform?: Platform;
};

export type BrandDraft = {
  name: string;
  niche: string;
  bio: string;
  audience: string;
  tone: Tone | "";
  customTone: string;
  writingStyle: string;
  avoid: string;
  language: string;
  platforms: Platform[];
  goals: Goal[];
  topicsText: string;
  preferredPlatform: Platform | "";
};

export type BrandRow = {
  id: string;
  user_id: string;
  name: string;
  niche: string | null;
  bio: string | null;
  audience: string | null;
  language: string | null;
  platforms: string[] | null;
  goals: string[] | null;
  topics: string[] | null;
  voice_preferences: VoicePreferences | Record<string, unknown> | null;
};

export type BrandWritePayload = {
  user_id: string;
  name: string;
  niche: string;
  bio: string | null;
  audience: string;
  language: string;
  platforms: Platform[];
  goals: Goal[];
  topics: string[];
  voice_preferences: VoicePreferences;
};

export type FieldErrors = Partial<Record<keyof BrandDraft | "form", string>>;

export function emptyBrandDraft(): BrandDraft {
  return {
    name: "",
    niche: "",
    bio: "",
    audience: "",
    tone: "",
    customTone: "",
    writingStyle: "",
    avoid: "",
    language: "English",
    platforms: [],
    goals: [],
    topicsText: "",
    preferredPlatform: "",
  };
}

export function parseTopics(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item, index, all) => item.length > 0 && all.indexOf(item) === index);
}

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function isGoal(value: string): value is Goal {
  return (GOALS as readonly string[]).includes(value);
}

export function isTone(value: string): value is Tone {
  return (TONES as readonly string[]).includes(value);
}

export function brandFromRow(row: BrandRow): BrandDraft {
  const voice = (row.voice_preferences ?? {}) as VoicePreferences;
  const tone = voice.tone && isTone(voice.tone) ? voice.tone : "";
  return {
    name: row.name ?? "",
    niche: row.niche ?? "",
    bio: row.bio ?? "",
    audience: row.audience ?? "",
    tone,
    customTone: voice.customTone ?? "",
    writingStyle: voice.writingStyle ?? "",
    avoid: voice.avoid ?? "",
    language: row.language?.trim() || "English",
    platforms: (row.platforms ?? []).filter(isPlatform),
    goals: (row.goals ?? []).filter(isGoal),
    topicsText: (row.topics ?? []).join("\n"),
    preferredPlatform:
      voice.preferredPlatform && isPlatform(voice.preferredPlatform) ? voice.preferredPlatform : "",
  };
}

export function validateBrandDraft(draft: BrandDraft, step?: number): FieldErrors {
  const errors: FieldErrors = {};
  const checkIdentity = step === undefined || step === 2;
  const checkVoice = step === undefined || step === 3;
  const checkContent = step === undefined || step === 4;

  if (checkIdentity) {
    if (!draft.name.trim()) errors.name = "Brand name is required.";
    if (!draft.niche.trim()) errors.niche = "Niche or industry is required.";
    if (!draft.audience.trim()) errors.audience = "Target audience is required.";
  }

  if (checkVoice) {
    if (!draft.tone || !isTone(draft.tone)) {
      errors.tone = "Choose a tone, or pick Custom and describe it.";
    } else if (draft.tone === "custom" && !draft.customTone.trim()) {
      errors.customTone = "Describe your custom tone.";
    }
    if (!draft.language.trim()) errors.language = "Language is required.";
  }

  if (checkContent) {
    if (draft.platforms.length === 0) {
      errors.platforms = "Select at least one platform.";
    }
    if (draft.platforms.some((platform) => !isPlatform(platform))) {
      errors.platforms = "Only LinkedIn and Instagram are supported in this phase.";
    }
    if (draft.goals.length === 0) {
      errors.goals = "Select at least one content goal.";
    }
    if (draft.goals.some((goal) => !isGoal(goal))) {
      errors.goals = "Choose from the listed content goals.";
    }
    if (
      draft.preferredPlatform &&
      (!isPlatform(draft.preferredPlatform) || !draft.platforms.includes(draft.preferredPlatform))
    ) {
      errors.platforms = "Default platform must be one of the platforms you selected.";
    }
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function toBrandWritePayload(draft: BrandDraft, userId: string): BrandWritePayload {
  if (!userId) {
    throw new Error("Authenticated user id is required.");
  }
  const tone = draft.tone && isTone(draft.tone) ? draft.tone : "professional";
  const voice: VoicePreferences = { tone };
  if (tone === "custom" && draft.customTone.trim()) {
    voice.customTone = draft.customTone.trim();
  }
  if (draft.writingStyle.trim()) voice.writingStyle = draft.writingStyle.trim();
  if (draft.avoid.trim()) voice.avoid = draft.avoid.trim();
  if (draft.preferredPlatform && isPlatform(draft.preferredPlatform) && draft.platforms.includes(draft.preferredPlatform)) {
    voice.preferredPlatform = draft.preferredPlatform;
  }

  return {
    user_id: userId,
    name: draft.name.trim(),
    niche: draft.niche.trim(),
    bio: draft.bio.trim() || null,
    audience: draft.audience.trim(),
    language: draft.language.trim() || "English",
    platforms: draft.platforms.filter(isPlatform),
    goals: draft.goals.filter(isGoal),
    topics: parseTopics(draft.topicsText),
    voice_preferences: voice,
  };
}

export function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function formatTone(tone: Tone | "", customTone: string): string {
  if (tone === "custom") return customTone.trim() || "Custom";
  if (!tone) return "Not set";
  return tone.charAt(0).toUpperCase() + tone.slice(1);
}

export function formatGoal(goal: Goal): string {
  return {
    grow_audience: "Grow an audience",
    build_authority: "Build authority",
    educate: "Educate",
    increase_engagement: "Increase engagement",
    share_experiences: "Share personal experiences",
    promote_business: "Promote a business",
  }[goal];
}

export function formatPlatform(platform: Platform): string {
  return platform === "linkedin" ? "LinkedIn" : "Instagram";
}

export function saveErrorMessage(error: { message?: string; code?: string } | null): string {
  if (!error?.message) return "Could not save the brand. Try again.";
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "You can only save a brand for your own account. Sign in again and retry.";
  }
  if (error.code === "23503") {
    return "Your profile is not ready yet. Sign out, sign in, and try again so a profile row can be created.";
  }
  return error.message;
}
