import { describe, expect, it } from "vitest";
import type { ContentPillar } from "./pillars";
import {
  buildStrategyReport,
  createDraftHrefForPillar,
  extractDraftPillar,
  type StrategySourceDraft,
} from "./strategy";

function pillar(overrides: Partial<ContentPillar> = {}): ContentPillar {
  return {
    id: "p1",
    user_id: "session-user",
    brand_id: "brand-1",
    name: "Education",
    description: "Explainers.",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function draft(
  id: string,
  pillarId = "",
  extra: { user_id?: string; name?: string; description?: string } = {},
): StrategySourceDraft {
  return {
    id,
    user_id: extra.user_id ?? "session-user",
    metadata: {
      inputs: {
        pillarId,
        pillarName: extra.name ?? "",
        pillarDescription: extra.description ?? "",
      },
    },
  };
}

const owned = [pillar(), pillar({ id: "p2", name: "Offers", description: "Products." })];

describe("extractDraftPillar", () => {
  it("reads Phase 8.2 metadata and treats missing inputs as unassigned", () => {
    expect(extractDraftPillar(draft("d1", "p1", { name: "Education" })).pillarId).toBe("p1");
    expect(extractDraftPillar({ id: "old", user_id: "session-user", metadata: null }).pillarId).toBe("");
    expect(extractDraftPillar({ id: "legacy", user_id: "session-user", metadata: { content: {} } }).pillarId).toBe(
      "",
    );
  });
});

describe("buildStrategyReport", () => {
  it("counts unique owned drafts across live pillars", () => {
    const report = buildStrategyReport({
      pillars: owned,
      drafts: [
        draft("d1", "p1"),
        draft("d1", "p1"),
        draft("d2", "p1"),
        draft("d3", "p2"),
      ],
      sessionUserId: "session-user",
      brandId: "brand-1",
    });
    expect(report.pillarCount).toBe(2);
    expect(report.draftCount).toBe(3);
    expect(report.representedPillarCount).toBe(2);
    expect(report.emptyPillarCount).toBe(0);
    expect(report.unassignedDraftCount).toBe(0);
    expect(report.mix.find((row) => row.pillarId === "p1")?.draftCount).toBe(2);
    expect(report.mix.find((row) => row.pillarId === "p2")?.draftCount).toBe(1);
    expect(report.limitations.some((line) => /not audience, engagement/i.test(line))).toBe(true);
  });

  it("handles empty pillars and empty drafts", () => {
    const empty = buildStrategyReport({
      pillars: [],
      drafts: [],
      sessionUserId: "session-user",
      brandId: "brand-1",
    });
    expect(empty.pillarCount).toBe(0);
    expect(empty.draftCount).toBe(0);
    expect(empty.recommendations[0]?.href).toBe("/studio/brand#content-pillars");

    const pillarsOnly = buildStrategyReport({
      pillars: owned,
      drafts: [],
      sessionUserId: "session-user",
      brandId: "brand-1",
    });
    expect(pillarsOnly.emptyPillarCount).toBe(2);
    expect(pillarsOnly.recommendations.some((item) => item.id === "first-draft")).toBe(true);
    expect(pillarsOnly.recommendations[0]?.href).toBe(createDraftHrefForPillar("p1"));
  });

  it("flags a live pillar with no saved drafts", () => {
    const report = buildStrategyReport({
      pillars: owned,
      drafts: [draft("d1", "p1")],
      sessionUserId: "session-user",
      brandId: "brand-1",
    });
    expect(report.emptyPillarCount).toBe(1);
    expect(report.gaps.some((gap) => gap.title.includes("Offers"))).toBe(true);
    const rec = report.recommendations.find((item) => item.id === "create-p2");
    expect(rec?.evidence).toMatch(/0 of 1 saved drafts/);
    expect(rec?.href).toBe("/studio/create?pillar=p2");
  });

  it("counts unassigned and older drafts without pillar metadata separately", () => {
    const report = buildStrategyReport({
      pillars: owned,
      drafts: [
        draft("d1", "p1"),
        draft("d2", ""),
        { id: "d3", user_id: "session-user", metadata: null },
      ],
      sessionUserId: "session-user",
      brandId: "brand-1",
    });
    expect(report.draftCount).toBe(3);
    expect(report.unassignedDraftCount).toBe(2);
    expect(report.representedPillarCount).toBe(1);
    expect(report.mix.find((row) => row.kind === "unassigned")?.draftCount).toBe(2);
    expect(report.recommendations.some((item) => item.href === "/studio/drafts")).toBe(true);
  });

  it("keeps deleted-pillar snapshots without substituting another live pillar", () => {
    const report = buildStrategyReport({
      pillars: owned,
      drafts: [
        draft("d1", "gone", { name: "Stories", description: "Personal notes." }),
        draft("d2", "p1"),
      ],
      sessionUserId: "session-user",
      brandId: "brand-1",
    });
    expect(report.formerDraftCount).toBe(1);
    expect(report.unassignedDraftCount).toBe(0);
    const former = report.mix.find((row) => row.kind === "former");
    expect(former?.name).toBe("Stories");
    expect(former?.draftCount).toBe(1);
    expect(report.mix.find((row) => row.pillarId === "p2")?.draftCount).toBe(0);
    expect(report.gaps.some((gap) => /removed from Brand settings/i.test(gap.evidence))).toBe(true);
  });

  it("does not invent associations from topics and ignores another user's rows", () => {
    const report = buildStrategyReport({
      pillars: [...owned, pillar({ id: "px", user_id: "other", name: "Stolen" })],
      drafts: [
        { id: "mine", user_id: "session-user", metadata: { inputs: { topic: "Offers launch" } } },
        draft("theirs", "p1", { user_id: "other" }),
      ],
      sessionUserId: "session-user",
      brandId: "brand-1",
    });
    expect(report.draftCount).toBe(1);
    expect(report.unassignedDraftCount).toBe(1);
    expect(report.pillarCount).toBe(2);
    expect(report.mix.find((row) => row.name === "Stolen")).toBeUndefined();
    expect(report.mix.find((row) => row.pillarId === "p2")?.draftCount).toBe(0);
  });

  it("explains concentration using the user's own tagged drafts", () => {
    const report = buildStrategyReport({
      pillars: owned,
      drafts: [draft("a", "p1"), draft("b", "p1"), draft("c", "p1"), draft("d", "p2")],
      sessionUserId: "session-user",
      brandId: "brand-1",
    });
    const balance = report.recommendations.find((item) => item.id === "balance");
    expect(balance?.title).toMatch(/Education/);
    expect(balance?.title).toMatch(/Offers/);
    expect(balance?.evidence).toMatch(/3 of 4/);
    expect(balance?.evidence).toMatch(/not a best-practice/);
    expect(balance?.href).toBe("/studio/create?pillar=p2");
  });
});
