import { flattenGeneratedText, type GeneratedContent } from "@/lib/content";

export const VARIATION_ANGLES = [
  "distinct",
  "mixed",
  "educational",
  "storytelling",
  "opinion",
  "practical",
  "question",
] as const;

export type VariationAngle = (typeof VARIATION_ANGLES)[number];

export const VARIATION_ANGLE_LABELS: Record<VariationAngle, string> = {
  distinct: "Three distinct rewrites",
  mixed: "Educational, story, and practical mix",
  educational: "Educational / explainer",
  storytelling: "Storytelling (no invented personal stories)",
  opinion: "Opinion-led",
  practical: "Practical / actionable",
  question: "Question-led discussion",
};

export const MIXED_VARIATION_ANGLES: VariationAngle[] = ["educational", "storytelling", "practical"];

export type HookOption = {
  text: string;
  angle: string;
};

export function isVariationAngle(value: string): value is VariationAngle {
  return (VARIATION_ANGLES as readonly string[]).includes(value);
}

export function labelsForVariationAngle(angle: VariationAngle): VariationAngle[] {
  if (angle === "mixed") return [...MIXED_VARIATION_ANGLES];
  if (angle === "distinct") return ["distinct", "distinct", "distinct"];
  return [angle, angle, angle];
}

export function openingText(content: GeneratedContent): string {
  if (content.format === "script" && content.script) {
    return content.script.hook.trim();
  }
  if (content.format === "carousel" && content.slides[0]) {
    return (content.slides[0].text || content.slides[0].title).trim();
  }
  const paragraphs = content.body.split(/\n\n/);
  return (paragraphs[0] ?? "").trim();
}

export function applyHookToContent(content: GeneratedContent, hook: string): GeneratedContent {
  const text = hook.trim();
  if (!text) return content;
  if (content.format === "script" && content.script) {
    return {
      ...content,
      script: { ...content.script, hook: text },
    };
  }
  if (content.format === "carousel") {
    if (!content.slides.length) return content;
    return {
      ...content,
      slides: content.slides.map((slide, index) => (index === 0 ? { ...slide, text } : slide)),
    };
  }
  const paragraphs = content.body.split(/\n\n/);
  if (paragraphs.length > 1) {
    return { ...content, body: [text, ...paragraphs.slice(1)].join("\n\n") };
  }
  const lines = content.body.split("\n");
  if (lines.length > 1) {
    return { ...content, body: [text, ...lines.slice(1)].join("\n") };
  }
  return { ...content, body: text };
}

export function variationDifference(
  original: GeneratedContent,
  alternative: GeneratedContent,
  angleLabel: string,
): string {
  const parts = [`Labeled as ${angleLabel}.`];
  if (original.title.trim() !== alternative.title.trim()) {
    parts.push("The title is worded differently.");
  }
  if (openingText(original) !== openingText(alternative)) {
    parts.push("The opening is different.");
  }
  if (flattenGeneratedText(original) === flattenGeneratedText(alternative)) {
    parts.push("The body text matches the original.");
  }
  parts.push("This compares wording only. It is not a prediction of engagement or performance.");
  return parts.join(" ");
}

export function parseHookOptions(payload: unknown): HookOption[] {
  const record = payload as { hooks?: unknown };
  if (!Array.isArray(record.hooks)) return [];
  return record.hooks
    .map((item) => {
      if (typeof item === "string") {
        return { text: item.trim(), angle: "" };
      }
      if (item && typeof item === "object" && "text" in item) {
        const row = item as { text?: unknown; angle?: unknown };
        return {
          text: typeof row.text === "string" ? row.text.trim() : "",
          angle: typeof row.angle === "string" ? row.angle : "",
        };
      }
      return { text: "", angle: "" };
    })
    .filter((item) => item.text.length > 0);
}

export function hookAngleLabel(angle: string): string {
  if (isVariationAngle(angle) && angle !== "distinct" && angle !== "mixed") {
    return VARIATION_ANGLE_LABELS[angle];
  }
  return "Opening hook";
}
