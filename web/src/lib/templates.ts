import { isPlatform, type Platform } from "@/lib/brand";
import {
  emptyCreateForm,
  formatsForPlatform,
  isContentFormat,
  type ContentFormat,
  type CreateFormState,
  type GeneratedContent,
} from "@/lib/content";

export const MAX_TEMPLATES = 24;
export const MIN_TEMPLATE_NAME = 1;
export const MAX_TEMPLATE_NAME = 80;
export const MAX_TEMPLATE_DESCRIPTION = 400;
export const MAX_SECTION_INSTRUCTION = 400;
export const MAX_GUIDANCE = 300;

export const TEMPLATE_CATEGORIES = [
  "educational",
  "story",
  "thought_leadership",
  "promotional",
  "faq",
  "list",
  "case_study",
  "script",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type TemplateSection = {
  title: string;
  instruction: string;
};

export type TemplateStructure = {
  sections: TemplateSection[];
  hook: string;
  body: string;
  cta: string;
  suggestedLength: string;
};

export type TemplateSource = "system" | "user";

export type ContentTemplate = {
  id: string;
  source: TemplateSource;
  user_id: string;
  brand_id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  content_format: ContentFormat;
  platform: Platform | "";
  structure: TemplateStructure;
  created_at: string;
  updated_at: string;
};

export type TemplateDraft = {
  name: string;
  description: string;
  category: TemplateCategory | "";
  content_format: ContentFormat | "";
  platform: Platform | "";
  structure: TemplateStructure;
};

export type TemplateFieldErrors = {
  name?: string;
  description?: string;
  category?: string;
  content_format?: string;
  platform?: string;
  structure?: string;
  form?: string;
};

export type TemplateWritePayload = {
  user_id: string;
  brand_id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  content_format: ContentFormat;
  platform: Platform | null;
  structure: TemplateStructure;
};

export function emptyTemplateStructure(): TemplateStructure {
  return { sections: [], hook: "", body: "", cta: "", suggestedLength: "" };
}

export function emptyTemplateDraft(): TemplateDraft {
  return {
    name: "",
    description: "",
    category: "educational",
    content_format: "text_post",
    platform: "",
    structure: emptyTemplateStructure(),
  };
}

export function isTemplateCategory(value: string): value is TemplateCategory {
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}

export function categoryLabel(category: TemplateCategory): string {
  return {
    educational: "Educational / how-to",
    story: "Storytelling",
    thought_leadership: "Thought leadership",
    promotional: "Promotional",
    faq: "FAQ",
    list: "Lists and tips",
    case_study: "Case study",
    script: "Short-form script",
  }[category];
}

export function parseTemplateStructure(raw: unknown): TemplateStructure {
  const fallback = emptyTemplateStructure();
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Record<string, unknown>;
  const sections = Array.isArray(value.sections)
    ? value.sections
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const title = String(row.title ?? "").trim().slice(0, 80);
          const instruction = String(row.instruction ?? "").trim().slice(0, MAX_SECTION_INSTRUCTION);
          if (!title && !instruction) return null;
          return { title: title || "Section", instruction };
        })
        .filter((item): item is TemplateSection => item !== null)
        .slice(0, 8)
    : [];
  return {
    sections,
    hook: String(value.hook ?? "").trim().slice(0, MAX_GUIDANCE),
    body: String(value.body ?? "").trim().slice(0, MAX_GUIDANCE),
    cta: String(value.cta ?? "").trim().slice(0, MAX_GUIDANCE),
    suggestedLength: String(value.suggestedLength ?? "").trim().slice(0, 80),
  };
}

export function templateInstructions(template: Pick<ContentTemplate, "name" | "category" | "structure">): string {
  const lines = [
    "Follow this writing structure. Do not invent facts, quotes, or results.",
    `Template: ${template.name} (${categoryLabel(template.category)}).`,
  ];
  template.structure.sections.forEach((section, index) => {
    lines.push(`${index + 1}. ${section.title}: ${section.instruction}`.trim());
  });
  if (template.structure.hook) lines.push(`Hook guidance: ${template.structure.hook}`);
  if (template.structure.body) lines.push(`Body guidance: ${template.structure.body}`);
  if (template.structure.cta) lines.push(`Call-to-action guidance: ${template.structure.cta}`);
  if (template.structure.suggestedLength) {
    lines.push(`Suggested length: ${template.structure.suggestedLength}`);
  }
  return lines.join("\n").slice(0, 4000);
}

export function applyTemplateToForm(
  base: CreateFormState,
  template: Pick<ContentTemplate, "platform" | "content_format" | "name" | "category" | "structure">,
  allowedPlatforms: Platform[],
): CreateFormState {
  const next = { ...base };
  if (template.platform && isPlatform(template.platform) && allowedPlatforms.includes(template.platform)) {
    next.platform = template.platform;
  }
  const formats = formatsForPlatform(next.platform);
  if (formats.includes(template.content_format)) {
    next.format = template.content_format;
  } else if (formats.length && !formats.includes(next.format as ContentFormat)) {
    next.format = formats[0] ?? next.format;
  }
  next.extraInstructions = templateInstructions(template);
  return next;
}

export function applyTemplatePreservesVoice(
  before: CreateFormState,
  after: CreateFormState,
): boolean {
  return before.pillarId === after.pillarId && before.topic === after.topic;
}

export function validateTemplateDraft(
  draft: TemplateDraft,
  existing: ContentTemplate[],
  options: { editingId?: string } = {},
): TemplateFieldErrors {
  const errors: TemplateFieldErrors = {};
  const name = draft.name.trim();
  const description = draft.description.trim();
  if (name.length < MIN_TEMPLATE_NAME) errors.name = "Enter a template name.";
  else if (name.length > MAX_TEMPLATE_NAME) errors.name = `Keep names under ${MAX_TEMPLATE_NAME} characters.`;
  if (!description) errors.description = "Describe when to use this structure.";
  else if (description.length > MAX_TEMPLATE_DESCRIPTION) {
    errors.description = `Keep descriptions under ${MAX_TEMPLATE_DESCRIPTION} characters.`;
  }
  if (!isTemplateCategory(draft.category)) errors.category = "Choose a category.";
  if (!isContentFormat(draft.content_format)) errors.content_format = "Choose a content format.";
  if (draft.platform && !isPlatform(draft.platform)) errors.platform = "Choose a supported platform or leave blank.";
  const usable =
    draft.structure.sections.some((section) => section.title.trim() || section.instruction.trim()) ||
    Boolean(draft.structure.hook.trim() || draft.structure.body.trim() || draft.structure.cta.trim());
  if (!usable) errors.structure = "Add at least one section or guidance field.";
  const duplicate = existing.some(
    (item) =>
      item.source === "user" &&
      item.id !== options.editingId &&
      item.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (name && duplicate) errors.name = "You already have a template with that name.";
  if (!options.editingId && existing.filter((item) => item.source === "user").length >= MAX_TEMPLATES) {
    errors.form = `You can save up to ${MAX_TEMPLATES} templates. Delete one to add another.`;
  }
  return errors;
}

export function canAddTemplate(userCount: number): boolean {
  return userCount < MAX_TEMPLATES;
}

export function toTemplateWritePayload(
  draft: TemplateDraft,
  sessionUserId: string,
  brandId: string,
): TemplateWritePayload {
  if (!sessionUserId) throw new Error("Authenticated user id is required.");
  if (!brandId) throw new Error("A saved brand is required.");
  if (!isTemplateCategory(draft.category) || !isContentFormat(draft.content_format)) {
    throw new Error("Template category and format are required.");
  }
  return {
    user_id: sessionUserId,
    brand_id: brandId,
    name: draft.name.trim(),
    description: draft.description.trim(),
    category: draft.category,
    content_format: draft.content_format,
    platform: draft.platform && isPlatform(draft.platform) ? draft.platform : null,
    structure: parseTemplateStructure(draft.structure),
  };
}

export function isOwnedTemplate(row: { user_id: string; source?: TemplateSource }, sessionUserId: string): boolean {
  if (row.source === "system") return true;
  return Boolean(sessionUserId) && row.user_id === sessionUserId;
}

export function structureFromWork(
  form: CreateFormState,
  content?: GeneratedContent | null,
): TemplateStructure {
  const sections: TemplateSection[] = [];
  if (form.keyPoints.trim()) {
    sections.push({ title: "Key points", instruction: form.keyPoints.trim().slice(0, MAX_SECTION_INSTRUCTION) });
  }
  if (form.extraInstructions.trim()) {
    sections.push({
      title: "Instructions",
      instruction: form.extraInstructions.trim().slice(0, MAX_SECTION_INSTRUCTION),
    });
  }
  const hook =
    content?.script?.hook?.trim() ||
    form.extraInstructions.trim().slice(0, MAX_GUIDANCE) ||
    "";
  return {
    sections: sections.length ? sections : [{ title: "Body", instruction: "Keep the same structure and claims as the saved draft." }],
    hook: hook.slice(0, MAX_GUIDANCE),
    body: "",
    cta: form.callToAction.trim().slice(0, MAX_GUIDANCE),
    suggestedLength: "",
  };
}

export function draftFromWork(
  name: string,
  description: string,
  form: CreateFormState,
  content?: GeneratedContent | null,
): TemplateDraft {
  return {
    name,
    description,
    category: form.format === "script" ? "script" : "educational",
    content_format: isContentFormat(form.format) ? form.format : "text_post",
    platform: form.platform && isPlatform(form.platform) ? form.platform : "",
    structure: structureFromWork(form, content),
  };
}

export function formWithOptionalTemplate(
  platforms: Platform[],
  preferredPlatform: Platform | "",
  template: ContentTemplate | null,
): CreateFormState {
  const base = emptyCreateForm(platforms, preferredPlatform);
  if (!template) return base;
  return applyTemplateToForm(base, template, platforms);
}

export const SYSTEM_TEMPLATES: ContentTemplate[] = [
  {
    id: "system:educational",
    source: "system",
    user_id: "",
    brand_id: "",
    name: "How-to explainer",
    description: "Teach one idea with a problem, steps, and a takeaway.",
    category: "educational",
    content_format: "text_post",
    platform: "",
    structure: {
      sections: [
        { title: "Problem", instruction: "Name the specific friction the reader already feels." },
        { title: "Steps", instruction: "Give 3–5 concrete actions. Do not invent tools or stats." },
        { title: "Takeaway", instruction: "Close with one thing they can try today." },
      ],
      hook: "Open with the mistake or delay people run into.",
      body: "Keep the explanation practical and specific.",
      cta: "Invite a comment with their current approach.",
      suggestedLength: "150–220 words",
    },
    created_at: "",
    updated_at: "",
  },
  {
    id: "system:story",
    source: "system",
    user_id: "",
    brand_id: "",
    name: "Personal story",
    description: "A short narrative with situation, tension, and what changed.",
    category: "story",
    content_format: "text_post",
    platform: "",
    structure: {
      sections: [
        { title: "Situation", instruction: "Set the scene using only facts the user provides." },
        { title: "Tension", instruction: "What was at stake? Do not invent people or quotes." },
        { title: "Resolution", instruction: "What they learned or changed." },
      ],
      hook: "Start mid-moment, not with a résumé.",
      body: "Keep first person only if the topic already uses it.",
      cta: "Ask what they would have done.",
      suggestedLength: "180–250 words",
    },
    created_at: "",
    updated_at: "",
  },
  {
    id: "system:thought_leadership",
    source: "system",
    user_id: "",
    brand_id: "",
    name: "Point of view",
    description: "A clear stance, why it matters, and a careful caveat.",
    category: "thought_leadership",
    content_format: "text_post",
    platform: "linkedin",
    structure: {
      sections: [
        { title: "Claim", instruction: "State the opinion in one sentence." },
        { title: "Why now", instruction: "Ground it in the user’s topic. No fake trends." },
        { title: "Caveat", instruction: "Name when the advice does not apply." },
      ],
      hook: "Lead with the claim, not a throat-clearing intro.",
      body: "Support with reasoning already in the brief.",
      cta: "Invite disagreement on a specific point.",
      suggestedLength: "120–200 words",
    },
    created_at: "",
    updated_at: "",
  },
  {
    id: "system:promotional",
    source: "system",
    user_id: "",
    brand_id: "",
    name: "Product announcement",
    description: "Who it is for, what changed, and a low-pressure next step.",
    category: "promotional",
    content_format: "caption",
    platform: "instagram",
    structure: {
      sections: [
        { title: "Audience", instruction: "Who this is for, in their words." },
        { title: "Offer", instruction: "What is new. Do not invent pricing or guarantees." },
        { title: "Proof", instruction: "Only use proof supplied in the topic or key points." },
      ],
      hook: "Lead with the reader outcome, not the company.",
      body: "Keep the pitch specific and short.",
      cta: "One action. No urgency tricks.",
      suggestedLength: "80–140 words",
    },
    created_at: "",
    updated_at: "",
  },
  {
    id: "system:faq",
    source: "system",
    user_id: "",
    brand_id: "",
    name: "FAQ thread",
    description: "Answer 3–5 real questions without padding.",
    category: "faq",
    content_format: "text_post",
    platform: "",
    structure: {
      sections: [
        { title: "Questions", instruction: "Use questions from the brief. Do not invent FAQs." },
        { title: "Answers", instruction: "Short, direct answers. Flag unknowns instead of guessing." },
      ],
      hook: "Open with the question people actually ask.",
      body: "Keep Q then A formatting.",
      cta: "Ask which question they still have.",
      suggestedLength: "120–200 words",
    },
    created_at: "",
    updated_at: "",
  },
  {
    id: "system:list",
    source: "system",
    user_id: "",
    brand_id: "",
    name: "Actionable list",
    description: "A numbered set of tips the reader can try.",
    category: "list",
    content_format: "carousel",
    platform: "",
    structure: {
      sections: [
        { title: "Promise", instruction: "What the list helps them finish." },
        { title: "Items", instruction: "5–7 slides or bullets. One action each." },
        { title: "Close", instruction: "The first item to try." },
      ],
      hook: "Name the number and the outcome.",
      body: "Keep items parallel and concrete.",
      cta: "Ask them to save or reply with their #1.",
      suggestedLength: "5–7 slides or bullets",
    },
    created_at: "",
    updated_at: "",
  },
  {
    id: "system:case_study",
    source: "system",
    user_id: "",
    brand_id: "",
    name: "Lesson learned",
    description: "Context, what was tried, and the lesson — no fake metrics.",
    category: "case_study",
    content_format: "text_post",
    platform: "linkedin",
    structure: {
      sections: [
        { title: "Context", instruction: "The starting situation using only supplied facts." },
        { title: "Approach", instruction: "What they tried." },
        { title: "Lesson", instruction: "What to reuse. Do not invent percentages." },
      ],
      hook: "Start with the lesson, then rewind.",
      body: "Keep numbers only if the user provided them.",
      cta: "Ask how they handled a similar constraint.",
      suggestedLength: "160–240 words",
    },
    created_at: "",
    updated_at: "",
  },
  {
    id: "system:script",
    source: "system",
    user_id: "",
    brand_id: "",
    name: "Short-form script",
    description: "Hook, body, and CTA for a spoken short video.",
    category: "script",
    content_format: "script",
    platform: "",
    structure: {
      sections: [
        { title: "Hook", instruction: "First 3 seconds: a concrete problem or question." },
        { title: "Body", instruction: "One idea. Spoken sentences, not essay prose." },
        { title: "CTA", instruction: "One next step they can do without leaving the app." },
      ],
      hook: "No slow intros.",
      body: "Write for speaking aloud.",
      cta: "Spoken, specific, and optional.",
      suggestedLength: "30–45 seconds",
    },
    created_at: "",
    updated_at: "",
  },
];

export function getSystemTemplate(id: string): ContentTemplate | null {
  const key = id.trim();
  return SYSTEM_TEMPLATES.find((item) => item.id === key || item.id === `system:${key}`) ?? null;
}

export function mergeTemplateLibrary(userRows: ContentTemplate[]): ContentTemplate[] {
  const owned = userRows.filter((row) => row.source === "user");
  return [...SYSTEM_TEMPLATES, ...owned];
}
