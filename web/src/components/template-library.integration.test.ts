import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "../app/studio/templates/page.tsx"), "utf8");
const library = readFileSync(path.resolve(__dirname, "template-library.tsx"), "utf8");
const actions = readFileSync(path.resolve(__dirname, "../app/studio/templates/actions.ts"), "utf8");
const createPage = readFileSync(path.resolve(__dirname, "../app/studio/create/page.tsx"), "utf8");

describe("template library wiring", () => {
  it("loads owned templates under the session user and brand", () => {
    expect(page).toContain("listOwnedTemplates");
    expect(page).toContain("mergeTemplateLibrary");
    expect(actions).toContain(".eq(\"user_id\", ctx.user.id)");
    expect(actions).toContain("toTemplateWritePayload(draft, ctx.user.id, ctx.brand.id)");
    expect(actions).not.toContain("SUPABASE_SERVICE_ROLE");
  });

  it("previews and applies templates to a new draft only", () => {
    expect(library).toContain("Use on a new draft");
    expect(library).toContain("/studio/create?template=");
    expect(library).toContain("Confirm delete");
    expect(library).toContain("Built-in");
    expect(createPage).toContain("params.template");
    expect(createPage).toContain("params.system");
    expect(createPage).toContain("applyTemplateToForm");
    expect(library).not.toMatch(/linkedin\.share|publish schedule/i);
  });
});
