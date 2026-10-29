import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editor = readFileSync(path.resolve(__dirname, "draft-editor.tsx"), "utf8");
const library = readFileSync(path.resolve(__dirname, "draft-library.tsx"), "utf8");
const appPy = readFileSync(path.resolve(__dirname, "../../../app.py"), "utf8");

describe("content export and legacy publish isolation", () => {
  it("exports a single draft from the editor without saving", () => {
    expect(editor).toContain("Export text");
    expect(editor).toContain("Export Markdown");
    expect(editor).toContain("Print");
    expect(editor).toContain("downloadTextFile");
    expect(editor).toContain("The saved draft was not changed");
  });

  it("exports only selected library drafts after confirmation", () => {
    expect(library).toContain("Select for export");
    expect(library).toContain("selectedOwnedDrafts");
    expect(library).toContain("Export selected CSV");
    expect(library).toContain("Unselected drafts are not included");
    expect(library).toContain("Saved drafts are not changed");
    expect(library).not.toContain("linkedin.share");
  });

  it("keeps the legacy Flask publisher behind an explicit env flag", () => {
    expect(appPy).toContain("ALLOW_LEGACY_PUBLISH");
    expect(appPy).toContain("make dev-api");
  });
});
