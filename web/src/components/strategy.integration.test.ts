import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "../app/studio/strategy/page.tsx"), "utf8");
const overview = readFileSync(path.resolve(__dirname, "strategy-overview.tsx"), "utf8");
const nav = readFileSync(path.resolve(__dirname, "studio-nav.tsx"), "utf8");
const navLinks = readFileSync(path.resolve(__dirname, "../lib/studio-nav.ts"), "utf8");
const createPage = readFileSync(path.resolve(__dirname, "../app/studio/create/page.tsx"), "utf8");
const studio = readFileSync(path.resolve(__dirname, "../app/studio/page.tsx"), "utf8");

describe("content strategy intelligence wiring", () => {
  it("loads owned pillars and drafts on an authenticated strategy page", () => {
    expect(page).toContain("listOwnedPillars");
    expect(page).toContain("listOwnedDrafts");
    expect(page).toContain("Promise.all");
    expect(page).toContain("buildStrategyReport");
    expect(page).toContain("isOwnedBy");
    expect(page).toContain("isOwnedPillar");
    expect(page).toContain("StudioShell title=\"Loading strategy…\"");
    expect(page).not.toContain("SUPABASE_SERVICE_ROLE");
  });

  it("links recommendations to Create, Idea Bank, and Brand settings", () => {
    expect(overview).toContain("/studio/create");
    expect(overview).toContain("/studio/ideas");
    expect(overview).toContain("/studio/brand#content-pillars");
    expect(overview).toContain("Saved-draft mix");
    expect(overview).toContain("not audience mix or performance");
    expect(overview).toMatch(/role="alert"/);
    expect(overview).not.toMatch(/engagement prediction|publish schedule/i);
  });

  it("adds Strategy to studio navigation and overview", () => {
    expect(nav).toContain("STUDIO_NAV_LINKS");
    expect(navLinks).toContain("/studio/strategy");
    expect(studio).toContain("/studio/strategy");
  });

  it("preselects a pillar on Create only after server-side ownership load", () => {
    expect(createPage).toContain("params.pillar");
    expect(createPage).toContain("loadOwnedPillar");
    expect(createPage).toContain("pillarId: requestedPillar.id");
  });
});
