import { describe, expect, it } from "vitest";
import { emptyBrandDraft, type BrandDraft } from "@/lib/brand";
import {
  brandToApi,
  contentEquals,
  emptyCreateForm,
  flattenGeneratedText,
  hydrateCreateForm,
  isOwnedBy,
  resolveCreatePlatform,
  toDraftWritePayload,
  validateCreateForm,
  withTrustedPillarSnapshot,
  type CreateFormState,
  type GeneratedContent,
} from "./content";

function form(overrides: Partial<CreateFormState> = {}): CreateFormState {
  return {
    platform: "linkedin",
    format: "text_post",
    topic: "Shipping evals",
    keyPoints: "",
    callToAction: "",
    keywords: "",
    extraInstructions: "",
    pillarId: "",
    pillarName: "",
    pillarDescription: "",
    ...overrides,
  };
}

const sample: GeneratedContent = {
  title: "Eval debt",
  body: "A long enough post body.",
  hashtags: ["#ai"],
  slides: [],
  script: null,
  platform: "linkedin",
  format: "text_post",
  status: "draft",
};

describe("validateCreateForm", () => {
  it("requires topic, platform, and format", () => {
    const errors = validateCreateForm(form({ topic: "", platform: "", format: "" }), ["linkedin"]);
    expect(errors.topic).toBeTruthy();
    expect(errors.platform).toBeTruthy();
    expect(errors.format).toBeTruthy();
  });

  it("rejects a platform not on the brand profile", () => {
    const errors = validateCreateForm(form({ platform: "instagram" }), ["linkedin"]);
    expect(errors.platform).toMatch(/brand profile/);
  });

  it("rejects caption on LinkedIn", () => {
    const errors = validateCreateForm(form({ format: "caption" }), ["linkedin"]);
    expect(errors.format).toBeTruthy();
  });

  it("accepts a valid LinkedIn text post", () => {
    expect(validateCreateForm(form(), ["linkedin"])).toEqual({});
  });

  it("does not require a content pillar", () => {
    expect(validateCreateForm(form({ pillarId: "" }), ["linkedin"])).toEqual({});
  });
});

describe("draft persistence mapping", () => {
  it("uses the session user id, not a client-supplied owner", () => {
    const payload = toDraftWritePayload(sample, form(), "session-user", "brand-1");
    expect(payload.user_id).toBe("session-user");
    expect(payload.status).toBe("draft");
    expect(Array.isArray(payload.metadata.content.hashtags)).toBe(true);
  });

  it("blocks access when the row belongs to someone else", () => {
    expect(isOwnedBy({ user_id: "a" }, "a")).toBe(true);
    expect(isOwnedBy({ user_id: "a" }, "b")).toBe(false);
    expect(isOwnedBy({ user_id: "a" }, "")).toBe(false);
  });

  it("stores the selected pillar snapshot on the draft metadata inputs", () => {
    const inputs = withTrustedPillarSnapshot(form({ pillarId: "p1" }), {
      id: "p1",
      name: "Education",
      description: "Practical explainers.",
    });
    const payload = toDraftWritePayload(sample, inputs, "session-user", "brand-1");
    expect(payload.metadata.inputs.pillarId).toBe("p1");
    expect(payload.metadata.inputs.pillarName).toBe("Education");
    expect(payload.metadata.inputs.keywords).toBe("");
  });

  it("sends only the owned brand id to the writing API", () => {
    const payload = brandToApi({ ...emptyBrandDraft(), name: "Forged Inc" }, "brand-1");
    expect(payload).toEqual({ id: "brand-1" });
  });

  it("hydrates older drafts that have no pillar fields without inventing a pillar", () => {
    const hydrated = hydrateCreateForm(
      { platform: "linkedin", format: "text_post", topic: "Old draft" },
      form(),
    );
    expect(hydrated.topic).toBe("Old draft");
    expect(hydrated.pillarId).toBe("");
    expect(hydrated.pillarName).toBe("");
  });
});

describe("flattenGeneratedText", () => {
  it("joins carousel slides and script sections for copy/save", () => {
    const carousel = flattenGeneratedText({
      ...sample,
      format: "carousel",
      slides: [
        { title: "Hook", text: "Start here" },
        { title: "Close", text: "End here" },
      ],
    });
    expect(carousel).toContain("1. Hook: Start here");
    const script = flattenGeneratedText({
      ...sample,
      format: "script",
      script: { hook: "Wait", body: "Why", cta: "Follow" },
    });
    expect(script).toContain("Hook: Wait");
    expect(script).toContain("CTA: Follow");
  });
});

describe("contentEquals", () => {
  it("treats trimmed copies as equal and edits as dirty", () => {
    expect(contentEquals(sample, { ...sample, body: "  A long enough post body.  " })).toBe(true);
    expect(contentEquals(sample, { ...sample, body: "Changed" })).toBe(false);
  });
});

describe("create form defaults", () => {
  it("uses a preferred platform only when it is on the brand, and never invents a pillar", () => {
    expect(resolveCreatePlatform(["linkedin", "instagram"], "instagram")).toBe("instagram");
    expect(resolveCreatePlatform(["linkedin"], "instagram")).toBe("linkedin");
    const form = emptyCreateForm(["linkedin", "instagram"], "instagram");
    expect(form.platform).toBe("instagram");
    expect(form.pillarId).toBe("");
  });
});

describe("empty brand still validates create form against allowed list", () => {
  const brand: BrandDraft = { ...emptyBrandDraft(), platforms: ["instagram"] };
  it("does not invent a LinkedIn option the profile omitted", () => {
    const errors = validateCreateForm(form({ platform: "linkedin" }), brand.platforms);
    expect(errors.platform).toBeTruthy();
  });
});
