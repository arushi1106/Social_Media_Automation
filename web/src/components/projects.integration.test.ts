import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "../app/studio/projects/page.tsx"), "utf8");
const detail = readFileSync(path.resolve(__dirname, "../app/studio/projects/[id]/page.tsx"), "utf8");
const actions = readFileSync(path.resolve(__dirname, "../app/studio/projects/actions.ts"), "utf8");
const workspace = readFileSync(path.resolve(__dirname, "project-workspace.tsx"), "utf8");
const createPage = readFileSync(path.resolve(__dirname, "../app/studio/create/page.tsx"), "utf8");
const nav = readFileSync(path.resolve(__dirname, "../lib/studio-nav.ts"), "utf8");

describe("content project wiring", () => {
  it("loads owned projects with session user and brand filters", () => {
    expect(page).toContain("listOwnedProjects");
    expect(actions).toContain(".eq(\"user_id\", ctx.user.id)");
    expect(actions).toContain("toProjectWritePayload(draft, ctx.user.id, ctx.brand.id)");
    expect(actions).not.toContain("SUPABASE_SERVICE_ROLE");
  });

  it("generates suggestions without auto-saving and links drafts by reference", () => {
    expect(workspace).toContain("discoverStudioIdeas");
    expect(workspace).toContain("Save to project");
    expect(workspace).toContain("not a publish schedule");
    expect(workspace).toContain("Confirm delete");
    expect(detail).toContain("draftsForProject");
    expect(detail).toContain("ideasForProject");
    expect(createPage).toContain("params.project");
    expect(createPage).toContain("createFormForProject");
    expect(nav).toContain("/studio/projects");
  });
});
