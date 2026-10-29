import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "../app/studio/create/page.tsx"), "utf8");
const form = readFileSync(path.resolve(__dirname, "create-draft-form.tsx"), "utf8");
const editor = readFileSync(path.resolve(__dirname, "draft-editor.tsx"), "utf8");
const actions = readFileSync(path.resolve(__dirname, "../app/studio/actions.ts"), "utf8");

describe("strategy-aware generation wiring", () => {
  it("loads owned pillars on the existing create page", () => {
    expect(page).toContain("listOwnedPillars");
    expect(page).toContain("CreateDraftForm");
    expect(page).toContain("pillars={pillars}");
    expect(page).toContain("loadOwnedPillar");
    expect(page).toContain("params.pillar");
  });

  it("can apply a template on create without treating it as a saved draft overwrite", () => {
    expect(page).toContain("params.template");
    expect(page).toContain("applyTemplateToForm");
    expect(form).toContain("Structure from template");
    expect(form).toContain("templateUnavailable");
  });

  it("lets the user pick a pillar or continue with none", () => {
    expect(form).toContain("Content pillar (optional)");
    expect(form).toContain("No pillar — use topic and brand only");
    expect(form).toContain("Add pillars in Brand settings");
    expect(form).toContain("do not guarantee engagement");
    expect(form).toContain("generateStudioDraft");
  });

  it("validates the selected pillar on the server before calling generate", () => {
    expect(actions).toContain("trustedPillarForGenerate");
    expect(actions).toContain("loadOwnedPillar");
    expect(actions).toContain("brandToApi(brand, ctx.brand.id)");
    expect(actions).toContain("pillar: toApiPillar");
    expect(actions).not.toContain("SUPABASE_SERVICE_ROLE");
  });

  it("keeps pillar context on refine, variations, and repurpose without auto-publishing", () => {
    expect(editor).toContain("refineStudioDraft(working, action, customInstructions, inputs)");
    expect(editor).toContain("generateStudioVariations(working, customInstructions, inputs, variationAngle)");
    expect(editor).toContain("repurposeStudioDraft(");
    expect(actions).toContain("pillarPayloadForRewrite");
    expect(actions).not.toMatch(/linkedin\.share|insta\.main/);
  });
});
