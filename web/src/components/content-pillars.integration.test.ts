import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "../app/studio/brand/page.tsx"), "utf8");
const manager = readFileSync(path.resolve(__dirname, "content-pillars.tsx"), "utf8");

describe("content pillars brand settings integration", () => {
  it("mounts the pillars manager on brand settings after a saved brand", () => {
    expect(page).toContain("ContentPillarsManager");
    expect(page).toContain("listOwnedPillars");
    expect(page).toContain("{brand ?");
  });

  it("exposes create, edit, delete, empty, and limit states", () => {
    expect(manager).toContain("Content pillars");
    expect(manager).toContain("emptyPillarsCopy");
    expect(manager).toContain("createStudioPillar");
    expect(manager).toContain("updateStudioPillar");
    expect(manager).toContain("deleteStudioPillar");
    expect(manager).toContain("Maximum of");
    expect(manager).toMatch(/does not publish/i);
  });
});
