import { describe, expect, it } from "vitest";
import type { GeneratedContent } from "./content";
import {
  defaultRepurposeTarget,
  editorStatusLabel,
  inputsForRepurposedDraft,
  sourceDraftPayload,
  supportedRepurposeOptions,
  validateRefineAction,
  validateRepurposeTarget,
} from "./refine";

const saved: GeneratedContent = {
  title: "Eval debt",
  body: "A long enough post body.",
  hashtags: ["#ai"],
  slides: [],
  script: null,
  platform: "linkedin",
  format: "text_post",
  status: "draft",
};

describe("validateRefineAction", () => {
  it("requires custom instructions only for custom", () => {
    expect(validateRefineAction("shorten", "")).toEqual({});
    expect(validateRefineAction("custom", "")).toHaveProperty("customInstructions");
    expect(validateRefineAction("custom", "Tighten the hook")).toEqual({});
    expect(validateRefineAction("unknown", "")).toHaveProperty("action");
  });
});

describe("repurpose targets", () => {
  it("defaults LinkedIn text to Instagram caption and excludes the source combo", () => {
    expect(defaultRepurposeTarget(saved)).toEqual({ platform: "instagram", format: "caption" });
    const options = supportedRepurposeOptions(saved);
    expect(options.some((item) => item.platform === "linkedin" && item.format === "text_post")).toBe(false);
    expect(options.some((item) => item.platform === "instagram" && item.format === "caption")).toBe(true);
    expect(options.some((item) => item.platform === "instagram" && item.format === "script")).toBe(true);
  });

  it("rejects the same platform and format", () => {
    expect(validateRepurposeTarget(saved, "linkedin", "text_post").targetFormat).toBeTruthy();
    expect(validateRepurposeTarget(saved, "tiktok", "caption").targetPlatform).toBeTruthy();
    expect(validateRepurposeTarget(saved, "instagram", "caption")).toEqual({});
  });
});

describe("draft safety helpers", () => {
  it("keeps source payload without owner ids", () => {
    const payload = sourceDraftPayload(saved);
    expect(payload).toEqual({
      title: saved.title,
      body: saved.body,
      hashtags: saved.hashtags,
      slides: saved.slides,
      script: saved.script,
    });
    expect(JSON.stringify(payload)).not.toMatch(/user_id/);
  });

  it("builds new-draft inputs from the target result, not the source platform", () => {
    const result: GeneratedContent = {
      ...saved,
      platform: "instagram",
      format: "caption",
      title: "Caption",
    };
    const inputs = inputsForRepurposedDraft(
      {
        platform: "linkedin",
        format: "text_post",
        topic: "Evals",
        keyPoints: "",
        callToAction: "",
        keywords: "",
        extraInstructions: "",
        pillarId: "p1",
        pillarName: "Education",
        pillarDescription: "Practical explainers.",
      },
      result,
    );
    expect(inputs.platform).toBe("instagram");
    expect(inputs.format).toBe("caption");
    expect(inputs.topic).toBe("Evals");
    expect(inputs.pillarId).toBe("p1");
    expect(inputs.pillarName).toBe("Education");
  });

  it("explains saved vs proposal vs alternatives", () => {
    expect(editorStatusLabel({ savedEqualsWorking: true, hasProposal: false, hasAlternatives: false })).toMatch(
      /last saved/,
    );
    expect(editorStatusLabel({ savedEqualsWorking: false, hasProposal: false, hasAlternatives: false })).toMatch(
      /Unsaved/,
    );
    expect(editorStatusLabel({ savedEqualsWorking: true, hasProposal: true, hasAlternatives: false })).toMatch(
      /unchanged until you apply/,
    );
    expect(editorStatusLabel({ savedEqualsWorking: true, hasProposal: false, hasAlternatives: true })).toMatch(
      /unchanged until you apply/,
    );
    expect(
      editorStatusLabel({
        savedEqualsWorking: true,
        hasProposal: false,
        hasAlternatives: false,
        hasHooks: true,
      }),
    ).toMatch(/Hook options/);
  });
});
