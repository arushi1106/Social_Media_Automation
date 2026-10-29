import { describe, expect, it } from "vitest";
import {
  brandFromRow,
  emptyBrandDraft,
  hasErrors,
  parseTopics,
  saveErrorMessage,
  toBrandWritePayload,
  toggleValue,
  validateBrandDraft,
  type BrandDraft,
  type BrandRow,
} from "./brand";

function validDraft(overrides: Partial<BrandDraft> = {}): BrandDraft {
  return {
    ...emptyBrandDraft(),
    name: "Northstar",
    niche: "AI",
    audience: "Independent consultants",
    tone: "conversational",
    language: "English",
    platforms: ["linkedin"],
    goals: ["educate", "grow_audience"],
    topicsText: "practical AI\ncareer change",
    ...overrides,
  };
}

describe("validateBrandDraft", () => {
  it("requires identity, tone, platforms, and goals", () => {
    const errors = validateBrandDraft(emptyBrandDraft());
    expect(errors.name).toBeTruthy();
    expect(errors.niche).toBeTruthy();
    expect(errors.audience).toBeTruthy();
    expect(errors.tone).toBeTruthy();
    expect(errors.platforms).toBeTruthy();
    expect(errors.goals).toBeTruthy();
    expect(hasErrors(errors)).toBe(true);
  });

  it("requires a custom tone description when tone is custom", () => {
    const errors = validateBrandDraft(validDraft({ tone: "custom", customTone: "  " }));
    expect(errors.customTone).toBeTruthy();
  });

  it("accepts a complete draft", () => {
    expect(validateBrandDraft(validDraft())).toEqual({});
  });

  it("validates only the requested step", () => {
    const draft = emptyBrandDraft();
    expect(validateBrandDraft(draft, 1)).toEqual({});
    expect(validateBrandDraft(draft, 2).name).toBeTruthy();
    expect(validateBrandDraft(draft, 2).platforms).toBeUndefined();
  });
});

describe("structured persistence mapping", () => {
  it("stores platforms and goals as arrays, not a joined string", () => {
    const payload = toBrandWritePayload(validDraft(), "user-123");
    expect(payload.platforms).toEqual(["linkedin"]);
    expect(payload.goals).toEqual(["educate", "grow_audience"]);
    expect(Array.isArray(payload.topics)).toBe(true);
    expect(payload.topics).toEqual(["practical AI", "career change"]);
  });

  it("uses the authenticated user id, ignoring any client-supplied owner", () => {
    const sneaky = validDraft() as BrandDraft & { user_id?: string };
    sneaky.user_id = "attacker";
    const payload = toBrandWritePayload(sneaky, "session-user");
    expect(payload.user_id).toBe("session-user");
  });

  it("rejects an empty session user id", () => {
    expect(() => toBrandWritePayload(validDraft(), "")).toThrow(/Authenticated user id/);
  });

  it("round-trips a database row into draft fields", () => {
    const row: BrandRow = {
      id: "brand-1",
      user_id: "session-user",
      name: "Northstar",
      niche: "AI",
      bio: "Operator notes",
      audience: "Consultants",
      language: "English",
      platforms: ["linkedin", "instagram", "x"],
      goals: ["educate", "not_a_goal"],
      topics: ["LLMs"],
      voice_preferences: {
        tone: "witty",
        writingStyle: "Short paragraphs",
        avoid: "hype",
      },
    };
    const draft = brandFromRow(row);
    expect(draft.platforms).toEqual(["linkedin", "instagram"]);
    expect(draft.goals).toEqual(["educate"]);
    expect(draft.tone).toBe("witty");
    expect(draft.topicsText).toBe("LLMs");
    expect(draft.preferredPlatform).toBe("");
  });

  it("stores an optional default platform and ignores one not on the brand", () => {
    const payload = toBrandWritePayload(validDraft({ preferredPlatform: "linkedin" }), "session-user");
    expect(payload.voice_preferences.preferredPlatform).toBe("linkedin");
    const cleared = toBrandWritePayload(validDraft({ preferredPlatform: "" }), "session-user");
    expect(cleared.voice_preferences.preferredPlatform).toBeUndefined();
    expect(validateBrandDraft(validDraft({ preferredPlatform: "instagram" })).platforms).toBeTruthy();
  });
});

describe("parseTopics and toggleValue", () => {
  it("splits topics on commas and newlines and drops duplicates", () => {
    expect(parseTopics("AI, AI\ncareers,  ")).toEqual(["AI", "careers"]);
  });

  it("toggles structured selections without string concatenation", () => {
    expect(toggleValue(["linkedin"], "instagram")).toEqual(["linkedin", "instagram"]);
    expect(toggleValue(["linkedin", "instagram"], "linkedin")).toEqual(["instagram"]);
  });
});

describe("saveErrorMessage", () => {
  it("explains RLS and missing-profile failures without exposing internals as success", () => {
    expect(saveErrorMessage({ code: "42501", message: "row-level security" })).toMatch(/own account/);
    expect(saveErrorMessage({ code: "23503", message: "fk" })).toMatch(/profile/i);
    expect(saveErrorMessage(null)).toMatch(/Could not save/);
  });
});
