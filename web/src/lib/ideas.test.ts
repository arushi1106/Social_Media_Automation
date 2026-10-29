import { describe, expect, it } from "vitest";
import { isOwnedBy } from "./content";
import {
  emptyDiscoveryForm,
  filterIdeas,
  ideaFromRow,
  ideaToCreateForm,
  ideasPageGate,
  parseGeneratedIdea,
  toIdeaWritePayload,
  validateDiscoveryForm,
  type GeneratedIdea,
  type IdeaRecord,
  type IdeaRow,
} from "./ideas";

const sample: GeneratedIdea = {
  title: "Golden evals",
  concept: "Show why a small eval set beats vague quality debates.",
  why_relevant: "Consultants need a way to talk about quality without jargon.",
  angle: "Practical, not theoretical.",
  hook: "Stop arguing about quality.",
  format: "text_post",
  call_to_action: "Comment with your eval count.",
  pillar: "evals",
  platform: "linkedin",
};

function record(overrides: Partial<IdeaRecord> = {}): IdeaRecord {
  return {
    ...sample,
    id: "idea-1",
    user_id: "session-user",
    brand_id: "brand-1",
    status: "saved",
    projectId: "",
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    ...overrides,
  };
}

describe("validateDiscoveryForm", () => {
  it("rejects unsupported platforms, objectives, and counts", () => {
    expect(validateDiscoveryForm(emptyDiscoveryForm(["linkedin"]), ["linkedin"])).toEqual({});
    expect(
      validateDiscoveryForm({ theme: "", platform: "instagram", objective: "", count: 5 }, ["linkedin"])
        .platform,
    ).toBeTruthy();
    expect(
      validateDiscoveryForm(
        { theme: "", platform: "linkedin", objective: "viral", count: 5 } as never,
        ["linkedin"],
      ).objective,
    ).toBeTruthy();
    expect(validateDiscoveryForm({ theme: "", platform: "", objective: "", count: 20 }, ["linkedin"]).count).toBeTruthy();
  });
});

describe("idea persistence mapping", () => {
  it("uses the session user id, not a client-supplied owner", () => {
    const payload = toIdeaWritePayload(sample, "session-user", "brand-1");
    expect(payload.user_id).toBe("session-user");
    expect(payload.status).toBe("saved");
    expect(payload.metadata.hook).toBe(sample.hook);
  });

  it("blocks access when the row belongs to someone else", () => {
    expect(isOwnedBy({ user_id: "a" }, "a")).toBe(true);
    expect(isOwnedBy({ user_id: "a" }, "b")).toBe(false);
  });
});

describe("ideaToCreateForm", () => {
  it("carries title, concept, hook, platform, and format into the existing generate form", () => {
    const form = ideaToCreateForm(sample, ["linkedin"]);
    expect(form.platform).toBe("linkedin");
    expect(form.format).toBe("text_post");
    expect(form.topic).toBe("Golden evals");
    expect(form.keyPoints).toContain("small eval set");
    expect(form.extraInstructions).toContain("Stop arguing about quality.");
    expect(form.callToAction).toContain("Comment");
    expect(form.pillarId).toBe("");
    expect(form.keywords).toBe("evals");
  });

  it("keeps the idea platform even when a brand default would differ", () => {
    const form = ideaToCreateForm(sample, ["instagram", "linkedin"]);
    expect(form.platform).toBe("linkedin");
    expect(form.pillarId).toBe("");
  });
});

describe("filterIdeas and parse", () => {
  it("filters by query and status without dropping the original list identity", () => {
    const used = record({ id: "idea-2", status: "used", title: "Carousel outline" });
    const ideas = [record(), used];
    expect(filterIdeas(ideas, "golden", "saved")).toHaveLength(1);
    expect(filterIdeas(ideas, "", "used")[0].id).toBe("idea-2");
    expect(filterIdeas(ideas, "missing", "all")).toHaveLength(0);
  });

  it("rejects malformed generated ideas", () => {
    expect(parseGeneratedIdea({})).toBeNull();
    expect(parseGeneratedIdea({ ...sample, platform: "tiktok" })).toBeNull();
    expect(parseGeneratedIdea(sample)?.title).toBe("Golden evals");
  });

  it("reads structured metadata from a saved row", () => {
    const row: IdeaRow = {
      id: "idea-1",
      user_id: "session-user",
      brand_id: "brand-1",
      title: sample.title,
      concept: sample.concept,
      platform: "linkedin",
      format: "text_post",
      status: "saved",
      metadata: { hook: sample.hook, angle: sample.angle, why_relevant: sample.why_relevant },
      created_at: "2024-01-01",
      updated_at: "2024-01-02",
    };
    expect(ideaFromRow(row)?.hook).toBe(sample.hook);
  });
});

describe("ideasPageGate", () => {
  it("sends incomplete setup to config, login, or onboarding", () => {
    expect(ideasPageGate({ configured: false, hasUser: false, hasBrand: false })).toBe("config");
    expect(ideasPageGate({ configured: true, hasUser: false, hasBrand: false })).toBe("login");
    expect(ideasPageGate({ configured: true, hasUser: true, hasBrand: false })).toBe("onboarding");
    expect(ideasPageGate({ configured: true, hasUser: true, hasBrand: true })).toBe("ok");
  });
});
