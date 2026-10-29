import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editor = readFileSync(path.resolve(__dirname, "draft-editor.tsx"), "utf8");
const page = readFileSync(path.resolve(__dirname, "../app/studio/drafts/[id]/page.tsx"), "utf8");
const section = readFileSync(path.resolve(__dirname, "quality-review.tsx"), "utf8");

describe("saved draft quality review UI", () => {
  it("renders DraftEditor from the saved-draft route", () => {
    expect(page).toContain('from "@/components/draft-editor"');
    expect(page).toContain("<DraftEditor");
    expect(page).not.toContain("CreateDraftForm");
  });

  it("always mounts a labelled Quality review section with Review content", () => {
    expect(editor).toContain("QualityReviewSection");
    expect(editor).toContain("reviewStudioDraft");
    expect(editor).toMatch(/<QualityReviewSection[\s\S]*review=\{review\}/);
    expect(editor).not.toMatch(/\{review \? \(/);
    expect(section).toContain("{REVIEW_SECTION_TITLE}");
    expect(section).toContain("REVIEW_ACTION_LABEL");
    expect(section).toContain("<h2");
    expect(section).toMatch(/onClick=\{onReview\}/);
    expect(section).toContain("comparingAlternatives");
    expect(editor).toContain("comparingAlternatives={Boolean(alternatives?.length || hooks?.length)}");
    expect(editor).toContain("Select this option");
    expect(editor).toContain("Apply selected alternative to editor");
    expect(editor).toContain("Generate opening hooks");
    expect(editor).toContain("applyHookToContent");
  });
});
