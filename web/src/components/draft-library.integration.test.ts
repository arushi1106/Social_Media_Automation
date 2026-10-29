import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "../app/studio/drafts/page.tsx"), "utf8");
const library = readFileSync(path.resolve(__dirname, "draft-library.tsx"), "utf8");
const actions = readFileSync(path.resolve(__dirname, "../app/studio/actions.ts"), "utf8");

describe("draft library organisation", () => {
  it("extends the existing drafts route instead of adding a second library", () => {
    expect(page).toContain("DraftLibrary");
    expect(page).toContain("listOwnedDrafts");
    expect(page).toContain("listOwnedPillars");
    expect(page).not.toContain("CreateDraftForm");
  });

  it("wires search, filters, sort, duplicate, and confirmed delete", () => {
    expect(library).toContain("filterLibraryDrafts");
    expect(library).toContain("Clear filters");
    expect(library).toContain("No drafts match these filters");
    expect(library).toContain("window.confirm");
    expect(library).toContain("duplicateStudioDraft");
    expect(library).toContain("deleteStudioDraft");
    expect(library).toContain("Open editor");
    expect(actions).toContain("eq(\"user_id\", ctx.user.id)");
    expect(actions).toContain("duplicateDraftTitle");
    expect(actions).not.toContain("SUPABASE_SERVICE_ROLE");
  });
});
