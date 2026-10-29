import { describe, expect, it } from "vitest";
import { isOwnedBy } from "./content";
import {
  MAX_PILLARS,
  canAddPillar,
  emptyPillarDraft,
  emptyPillarsCopy,
  isOwnedPillar,
  pillarContextForRewrite,
  resolveTrustedPillar,
  toApiPillar,
  toPillarWritePayload,
  validatePillarDraft,
  type ContentPillar,
} from "./pillars";

function pillar(overrides: Partial<ContentPillar> = {}): ContentPillar {
  return {
    id: "p1",
    user_id: "session-user",
    brand_id: "brand-1",
    name: "Education",
    description: "Practical explainers for consultants.",
    created_at: "2026-10-01",
    updated_at: "2026-10-01",
    ...overrides,
  };
}

describe("validatePillarDraft", () => {
  it("requires name and description", () => {
    const errors = validatePillarDraft(emptyPillarDraft(), []);
    expect(errors.name).toBeTruthy();
    expect(errors.description).toBeTruthy();
  });

  it("rejects a blank name after trim", () => {
    expect(validatePillarDraft({ name: "   ", description: "A theme." }, []).name).toBeTruthy();
  });

  it("rejects duplicate names case-insensitively except when editing the same row", () => {
    const existing = [pillar()];
    expect(
      validatePillarDraft({ name: "education", description: "Another take." }, existing).name,
    ).toMatch(/already have/);
    expect(
      validatePillarDraft({ name: "Education", description: "Updated copy." }, existing, {
        editingId: "p1",
      }),
    ).toEqual({});
  });

  it("blocks a ninth pillar", () => {
    const existing = Array.from({ length: MAX_PILLARS }, (_, index) =>
      pillar({ id: `p${index}`, name: `Pillar ${index}` }),
    );
    expect(canAddPillar(existing.length)).toBe(false);
    expect(validatePillarDraft({ name: "New", description: "Theme." }, existing).form).toMatch(/up to 8/);
    expect(canAddPillar(7)).toBe(true);
  });
});

describe("pillar persistence mapping", () => {
  it("uses the session user id and saved brand id, not client-supplied owners", () => {
    const payload = toPillarWritePayload(
      { name: " Offers ", description: " Product updates. " },
      "session-user",
      "brand-1",
    );
    expect(payload.user_id).toBe("session-user");
    expect(payload.brand_id).toBe("brand-1");
    expect(payload.name).toBe("Offers");
    expect(() => toPillarWritePayload({ name: "A", description: "B" }, "", "brand-1")).toThrow(
      /Authenticated user id/,
    );
  });

  it("blocks access when the row belongs to someone else", () => {
    expect(isOwnedPillar({ user_id: "a" }, "a")).toBe(true);
    expect(isOwnedPillar({ user_id: "a" }, "b")).toBe(false);
    expect(isOwnedBy({ user_id: "a" }, "b")).toBe(false);
  });
});

describe("empty state copy", () => {
  it("explains the empty bank and counts saved pillars", () => {
    expect(emptyPillarsCopy(0)).toMatch(/No content pillars yet/);
    expect(emptyPillarsCopy(2)).toBe("2 of 8 pillars saved.");
  });
});

describe("resolveTrustedPillar", () => {
  const owned = [
    pillar(),
    pillar({ id: "p2", name: "Offers", description: "Product updates." }),
  ];

  it("does not select a pillar when the user left the field empty", () => {
    expect(resolveTrustedPillar("", owned, "session-user", "brand-1")).toEqual({ status: "none" });
    expect(resolveTrustedPillar("   ", owned, "session-user", "brand-1")).toEqual({ status: "none" });
  });

  it("returns the owned row for a matching id", () => {
    const result = resolveTrustedPillar("p1", owned, "session-user", "brand-1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.pillar.name).toBe("Education");
      expect(result.pillar.description).toContain("consultants");
    }
  });

  it("rejects another user's pillar id instead of substituting a different owned pillar", () => {
    const foreign = pillar({ id: "other", user_id: "someone-else" });
    expect(resolveTrustedPillar("other", [...owned, foreign], "session-user", "brand-1").status).toBe(
      "unavailable",
    );
    expect(resolveTrustedPillar("missing", owned, "session-user", "brand-1").status).toBe("unavailable");
    expect(resolveTrustedPillar("p1", owned, "someone-else", "brand-1").status).toBe("unavailable");
    expect(resolveTrustedPillar("p1", owned, "session-user", "other-brand").status).toBe("unavailable");
  });

  it("uses a saved snapshot on rewrite when the live pillar is gone, without picking another pillar", () => {
    const snapshot = pillarContextForRewrite("deleted", owned, "session-user", "brand-1", {
      name: "Education",
      description: "Practical explainers for consultants.",
    });
    expect(snapshot?.id).toBe("deleted");
    expect(snapshot?.name).toBe("Education");
    expect(snapshot?.name).not.toBe("Offers");
    expect(pillarContextForRewrite("", owned, "session-user", "brand-1")).toBeNull();
  });

  it("sends only the pillar id to the writing API", () => {
    expect(toApiPillar({ id: "p1", name: "Education", description: "Practical explainers." })).toEqual({
      id: "p1",
    });
    expect(toApiPillar(null)).toBeNull();
  });
});
