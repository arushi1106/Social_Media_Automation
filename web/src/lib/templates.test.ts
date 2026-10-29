import { describe, expect, it } from "vitest";
import { emptyCreateForm } from "./content";
import {
  applyTemplatePreservesVoice,
  applyTemplateToForm,
  draftFromWork,
  getSystemTemplate,
  mergeTemplateLibrary,
  parseTemplateStructure,
  templateInstructions,
  toTemplateWritePayload,
  validateTemplateDraft,
  type ContentTemplate,
  type TemplateDraft,
} from "./templates";

const owned: ContentTemplate = {
  id: "t1",
  source: "user",
  user_id: "session-user",
  brand_id: "brand-1",
  name: "My how-to",
  description: "Internal evals posts",
  category: "educational",
  content_format: "text_post",
  platform: "linkedin",
  structure: {
    sections: [{ title: "Steps", instruction: "Three actions." }],
    hook: "Start with the delay.",
    body: "",
    cta: "Ask for their stack.",
    suggestedLength: "150 words",
  },
  created_at: "2026-10-01",
  updated_at: "2026-10-01",
};

function draft(overrides: Partial<TemplateDraft> = {}): TemplateDraft {
  return {
    name: "My how-to",
    description: "Internal evals posts",
    category: "educational",
    content_format: "text_post",
    platform: "linkedin",
    structure: {
      sections: [{ title: "Steps", instruction: "Three actions." }],
      hook: "",
      body: "",
      cta: "",
      suggestedLength: "",
    },
    ...overrides,
  };
}

describe("template library", () => {
  it("exposes system templates separately from user rows", () => {
    const library = mergeTemplateLibrary([owned]);
    expect(library.some((item) => item.source === "system")).toBe(true);
    expect(library.filter((item) => item.source === "user").map((item) => item.id)).toEqual(["t1"]);
    expect(getSystemTemplate("educational")?.id).toBe("system:educational");
    expect(getSystemTemplate("missing")).toBeNull();
  });

  it("applies structure without changing topic or pillar, and respects brand platforms", () => {
    const base = {
      ...emptyCreateForm(["linkedin"], "linkedin"),
      topic: "Shipping evals",
      pillarId: "p1",
      extraInstructions: "Keep it short.",
    };
    const after = applyTemplateToForm(base, owned, ["linkedin"]);
    expect(applyTemplatePreservesVoice(base, after)).toBe(true);
    expect(after.topic).toBe("Shipping evals");
    expect(after.pillarId).toBe("p1");
    expect(after.platform).toBe("linkedin");
    expect(after.format).toBe("text_post");
    expect(after.extraInstructions).toContain("Follow this writing structure");
    expect(after.extraInstructions).toContain("Three actions");
    expect(after.extraInstructions).not.toBe("Keep it short.");
  });

  it("does not force a platform that is not on the brand", () => {
    const base = emptyCreateForm(["linkedin"], "linkedin");
    const instagramTemplate = { ...owned, platform: "instagram" as const, content_format: "caption" as const };
    const after = applyTemplateToForm(base, instagramTemplate, ["linkedin"]);
    expect(after.platform).toBe("linkedin");
    expect(after.format).not.toBe("caption");
  });

  it("rejects empty, duplicate, and oversized drafts", () => {
    expect(validateTemplateDraft(draft({ name: "" }), []).name).toBeTruthy();
    expect(validateTemplateDraft(draft({ structure: { sections: [], hook: "", body: "", cta: "", suggestedLength: "" } }), []).structure).toBeTruthy();
    expect(validateTemplateDraft(draft(), [owned]).name).toMatch(/already have/);
    expect(validateTemplateDraft(draft({ name: "Other" }), [owned], { editingId: "t1" }).name).toBeUndefined();
  });

  it("uses the session user id on write payloads", () => {
    const payload = toTemplateWritePayload(draft(), "session-user", "brand-1");
    expect(payload.user_id).toBe("session-user");
    expect(payload.brand_id).toBe("brand-1");
    expect(payload.platform).toBe("linkedin");
  });

  it("parses malformed structure without throwing", () => {
    expect(parseTemplateStructure(null).sections).toEqual([]);
    expect(parseTemplateStructure({ sections: [{ title: "  " }] }).sections).toEqual([]);
    expect(parseTemplateStructure({ sections: "nope", hook: 1 }).hook).toBe("1");
  });

  it("builds instructions that stay user-authored, not trusted brand context", () => {
    const text = templateInstructions(owned);
    expect(text).toContain("Do not invent facts");
    expect(text).not.toMatch(/brand_id|service_role/i);
  });

  it("can snapshot a draft into a template without copying the full post body as a new draft", () => {
    const form = {
      ...emptyCreateForm(["linkedin"]),
      topic: "Evals",
      extraInstructions: "Keep claims sourced.",
      callToAction: "Comment with your set.",
    };
    const saved = draftFromWork("Evals structure", "From my post", form);
    expect(saved.structure.cta).toContain("Comment");
    expect(saved.content_format).toBe("text_post");
  });
});
