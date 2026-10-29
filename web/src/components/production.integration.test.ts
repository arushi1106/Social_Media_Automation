import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "../app/studio/work/page.tsx"), "utf8");
const overview = readFileSync(path.resolve(__dirname, "production-overview.tsx"), "utf8");
const editor = readFileSync(path.resolve(__dirname, "draft-editor.tsx"), "utf8");
const actions = readFileSync(path.resolve(__dirname, "../app/studio/actions.ts"), "utf8");
const nav = readFileSync(path.resolve(__dirname, "../lib/studio-nav.ts"), "utf8");

describe("production workspace wiring", () => {
  it("builds the board from owned ideas, drafts, pillars, and projects", () => {
    expect(page).toContain("listOwnedDrafts");
    expect(page).toContain("listOwnedIdeas");
    expect(page).toContain("listOwnedProjects");
    expect(overview).toContain("buildProductionSnapshot");
    expect(overview).toContain("not reach, engagement, or publishing");
    expect(overview).not.toMatch(/will perform|publish schedule/i);
    expect(nav).toContain("/studio/work");
  });

  it("marks ready using the existing draft/ready column and links to review", () => {
    expect(actions).toContain("markStudioDraftStatus");
    expect(actions).toContain(".eq(\"user_id\", ctx.user.id)");
    expect(editor).toContain("Mark ready for use");
    expect(overview).toContain("#quality-review");
  });
});
