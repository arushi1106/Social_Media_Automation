import { describe, expect, it } from "vitest";
import { buildProductionSnapshot, draftStage, productionEmptyCopy } from "./production";
import type { DraftRow } from "./content";
import type { IdeaRecord } from "./ideas";
import type { ContentProject } from "./projects";

function draft(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: "d1",
    user_id: "u1",
    brand_id: "b1",
    platform: "linkedin",
    format: "text_post",
    topic: "Evals",
    title: "Eval debt",
    body: "Body",
    status: "draft",
    metadata: { inputs: { projectId: "p1", pillarId: "pill-1", pillarName: "Education" } },
    created_at: "2026-10-01",
    updated_at: "2026-10-02",
    ...overrides,
  };
}

describe("production snapshot", () => {
  it("maps draft and ready onto existing statuses only", () => {
    expect(draftStage("draft")).toBe("drafting");
    expect(draftStage("ready")).toBe("ready");
    expect(draftStage("unknown")).toBe("drafting");
  });

  it("counts real records and unfinished projects without performance claims", () => {
    const snapshot = buildProductionSnapshot(
      [
        draft(),
        draft({ id: "d2", status: "ready", updated_at: "2026-10-03", platform: "instagram" }),
      ],
      [{ id: "i1", status: "saved", projectId: "p1" } as IdeaRecord],
      [{ id: "pill-1", name: "Education" } as never],
      [{ id: "p1", name: "Launch" } as ContentProject],
    );
    expect(snapshot.draftingCount).toBe(1);
    expect(snapshot.readyCount).toBe(1);
    expect(snapshot.ideaCount).toBe(1);
    expect(snapshot.unfinishedProjects[0]?.id).toBe("p1");
    expect(snapshot.byPlatform.map((item) => item.platform).sort()).toEqual(["instagram", "linkedin"]);
  });

  it("describes empty and all-ready states without implying publishing", () => {
    expect(productionEmptyCopy(buildProductionSnapshot([], [], [], [])).toLowerCase()).toContain("nothing is published");
    expect(
      productionEmptyCopy(
        buildProductionSnapshot([draft({ status: "ready" })], [], [], []),
      ).toLowerCase(),
    ).toContain("ready for use");
    expect(
      productionEmptyCopy(buildProductionSnapshot([], [{ id: "i1", status: "saved", projectId: "" } as IdeaRecord], [], [])),
    ).toMatch(/ideas but no drafts/i);
  });
});
