import {
  FORMATS_BY_PLATFORM,
  formatLabel,
  formatsForPlatform,
  isContentFormat,
  type ContentFormat,
  type CreateFormState,
  type GeneratedContent,
} from "@/lib/content";
import { isPlatform, type Platform } from "@/lib/brand";

export const REFINE_ACTIONS = [
  "conversational",
  "professional",
  "engaging",
  "shorten",
  "expand",
  "improve_hook",
  "improve_cta",
  "custom",
] as const;

export type RefineAction = (typeof REFINE_ACTIONS)[number];

export const REFINE_ACTION_LABELS: Record<RefineAction, string> = {
  conversational: "Make it more conversational",
  professional: "Make it more professional",
  engaging: "Make it more engaging",
  shorten: "Make it shorter",
  expand: "Expand with more detail",
  improve_hook: "Improve the opening hook",
  improve_cta: "Improve the call to action",
  custom: "Give me custom instructions",
};

export type RefineFieldErrors = {
  action?: string;
  customInstructions?: string;
  targetPlatform?: string;
  targetFormat?: string;
};

export function isRefineAction(value: string): value is RefineAction {
  return (REFINE_ACTIONS as readonly string[]).includes(value);
}

export function validateRefineAction(
  action: string,
  customInstructions: string,
): RefineFieldErrors {
  const errors: RefineFieldErrors = {};
  if (!isRefineAction(action)) {
    errors.action = "Choose a rewrite action.";
    return errors;
  }
  if (action === "custom" && !customInstructions.trim()) {
    errors.customInstructions = "Enter custom instructions for this rewrite.";
  }
  if (customInstructions.trim().length > 2000) {
    errors.customInstructions = "Keep custom instructions under 2000 characters.";
  }
  return errors;
}

export function validateRepurposeTarget(
  source: GeneratedContent,
  targetPlatform: string,
  targetFormat: string,
): RefineFieldErrors {
  const errors: RefineFieldErrors = {};
  if (!isPlatform(targetPlatform)) {
    errors.targetPlatform = "Choose a supported target platform.";
  }
  const allowed = formatsForPlatform(targetPlatform as Platform | "");
  if (!isContentFormat(targetFormat) || !allowed.includes(targetFormat)) {
    errors.targetFormat = "Choose a supported format for that platform.";
  }
  if (
    isPlatform(targetPlatform) &&
    isContentFormat(targetFormat) &&
    source.platform === targetPlatform &&
    source.format === targetFormat
  ) {
    errors.targetFormat = "Choose a different platform or format to repurpose.";
  }
  return errors;
}

export function defaultRepurposeTarget(source: GeneratedContent): {
  platform: Platform;
  format: ContentFormat;
} {
  if (source.platform === "linkedin") {
    if (source.format === "carousel") return { platform: "instagram", format: "carousel" };
    if (source.format === "script") return { platform: "instagram", format: "script" };
    return { platform: "instagram", format: "caption" };
  }
  if (source.format === "carousel") return { platform: "linkedin", format: "carousel" };
  if (source.format === "script") return { platform: "linkedin", format: "script" };
  return { platform: "linkedin", format: "text_post" };
}

export function supportedRepurposeOptions(source: GeneratedContent): {
  platform: Platform;
  format: ContentFormat;
  label: string;
}[] {
  const options: { platform: Platform; format: ContentFormat; label: string }[] = [];
  (Object.keys(FORMATS_BY_PLATFORM) as Platform[]).forEach((platform) => {
    FORMATS_BY_PLATFORM[platform].forEach((format) => {
      if (platform === source.platform && format === source.format) return;
      options.push({
        platform,
        format,
        label: `${platform === "linkedin" ? "LinkedIn" : "Instagram"} · ${formatLabel(format)}`,
      });
    });
  });
  return options;
}

export function sourceDraftPayload(content: GeneratedContent) {
  return {
    title: content.title,
    body: content.body,
    hashtags: content.hashtags,
    slides: content.slides,
    script: content.script,
  };
}

export function inputsForRepurposedDraft(
  sourceInputs: CreateFormState,
  result: GeneratedContent,
): CreateFormState {
  return {
    ...sourceInputs,
    platform: result.platform,
    format: result.format,
    extraInstructions: sourceInputs.extraInstructions,
  };
}

export function editorStatusLabel(options: {
  savedEqualsWorking: boolean;
  hasProposal: boolean;
  hasAlternatives: boolean;
  hasHooks?: boolean;
}): string {
  if (options.hasHooks) {
    return "Hook options are ready. Select one and apply it to replace only the opening. Nothing is saved yet.";
  }
  if (options.hasAlternatives) {
    return "Alternatives are ready. Select one, then apply it to the editor. The saved draft is unchanged until you apply and save.";
  }
  if (options.hasProposal) {
    return "A rewrite is ready to apply. The saved draft is unchanged until you apply and save.";
  }
  if (options.savedEqualsWorking) {
    return "Showing the last saved draft.";
  }
  return "Unsaved edits in the editor. The last saved draft is unchanged until you save.";
}
