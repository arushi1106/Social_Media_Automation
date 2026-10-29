import { describe, expect, it } from "vitest";
import type { DraftRow } from "./content";
import type { ContentPillar } from "./pillars";
import {
  duplicateDraftTitle,
  emptyLibraryFilters,
  filterLibraryDrafts,
  libraryFiltersAreClear,
  libraryPillarKind,
  libraryPillarLabel,
  paginateLibrary,
  LIBRARY_PAGE_SIZE,
} from "./library";

function pillar(overrides: Partial<ContentPillar> = {}): ContentPillar {
  return {
    id: "p1",
    user_id: "session-user",
    brand_id: "brand-1",
    name: "Education",
    description: "Explainers.",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function row(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: "d1",
    user_id: "session-user",
    brand_id: "brand-1",
    platform: "linkedin",
    format: "text_post",
    topic: "Evals",
    title: "Eval debt",
    body: "Start with a golden set.",
    status: "draft",
    metadata: { inputs: { pillarId: "p1", pillarName: "Education", pillarDescription: "Explainers." } },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

const pillars = [pillar(), pillar({ id: "p2", name: "Offers" })];

describe("filterLibraryDrafts", () => {
  it("matches title, topic, body, and pillar labels", () => {
    const drafts = [
      row(),
      row({ id: "d2", title: "Caption", topic: "Launch", body: "Product photo notes", metadata: { inputs: {} } }),
    ];
    expect(filterLibraryDrafts(drafts, { ...emptyLibraryFilters(), query: "golden" }, pillars, "session-user")).toHaveLength(
      1,
    );
    expect(filterLibraryDrafts(drafts, { ...emptyLibraryFilters(), query: "education" }, pillars, "session-user")[0].id).toBe(
      "d1",
    );
    expect(filterLibraryDrafts(drafts, { ...emptyLibraryFilters(), query: "missing" }, pillars, "session-user")).toHaveLength(
      0,
    );
    expect(filterLibraryDrafts(drafts, emptyLibraryFilters(), pillars, "session-user")).toHaveLength(2);
  });

  it("composes platform, format, status, and pillar filters", () => {
    const drafts = [
      row(),
      row({
        id: "d2",
        platform: "instagram",
        format: "caption",
        status: "ready",
        metadata: { inputs: {} },
      }),
      row({ id: "d3", metadata: { inputs: { pillarId: "gone", pillarName: "Stories" } } }),
    ];
    const combined = filterLibraryDrafts(
      drafts,
      { ...emptyLibraryFilters(), platform: "instagram", format: "caption", status: "ready", pillar: "unassigned" },
      pillars,
      "session-user",
    );
    expect(combined.map((item) => item.id)).toEqual(["d2"]);
    expect(filterLibraryDrafts(drafts, { ...emptyLibraryFilters(), pillar: "p1" }, pillars, "session-user")[0].id).toBe(
      "d1",
    );
    expect(filterLibraryDrafts(drafts, { ...emptyLibraryFilters(), pillar: "former" }, pillars, "session-user")[0].id).toBe(
      "d3",
    );
  });

  it("sorts deterministically and ignores another user's rows", () => {
    const drafts = [
      row({ id: "b", title: "Beta", updated_at: "2026-01-01T00:00:00Z", created_at: "2026-01-03T00:00:00Z" }),
      row({ id: "a", title: "Alpha", updated_at: "2026-01-02T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }),
      row({ id: "x", user_id: "other", title: "Secret" }),
    ];
    expect(
      filterLibraryDrafts(drafts, { ...emptyLibraryFilters(), sort: "updated" }, pillars, "session-user").map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b"]);
    expect(
      filterLibraryDrafts(drafts, { ...emptyLibraryFilters(), sort: "created" }, pillars, "session-user").map(
        (item) => item.id,
      ),
    ).toEqual(["b", "a"]);
    expect(
      filterLibraryDrafts(drafts, { ...emptyLibraryFilters(), sort: "title" }, pillars, "session-user").map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("treats legacy drafts as unassigned and keeps deleted-pillar snapshots", () => {
    const legacy = row({ id: "old", metadata: null, title: "Legacy" });
    const former = row({
      id: "gone-draft",
      metadata: { inputs: { pillarId: "deleted", pillarName: "Stories" } },
    });
    expect(libraryPillarKind(legacy, new Set(["p1"]))).toBe("unassigned");
    expect(libraryPillarLabel(former, new Map([["p1", pillars[0]]]))).toBe("Stories (removed)");
    const found = filterLibraryDrafts(
      [legacy, former],
      { ...emptyLibraryFilters(), query: "stories" },
      pillars,
      "session-user",
    );
    expect(found.map((item) => item.id)).toEqual(["gone-draft"]);
  });
});

describe("library helpers", () => {
  it("paginates, clears filters, and prefixes duplicate titles once", () => {
    const rows = Array.from({ length: LIBRARY_PAGE_SIZE + 2 }, (_, index) => row({ id: `d${index}` }));
    const page = paginateLibrary(rows, LIBRARY_PAGE_SIZE);
    expect(page.items).toHaveLength(LIBRARY_PAGE_SIZE);
    expect(page.remaining).toBe(2);
    expect(libraryFiltersAreClear(emptyLibraryFilters())).toBe(true);
    expect(libraryFiltersAreClear({ ...emptyLibraryFilters(), query: "x" })).toBe(false);
    expect(duplicateDraftTitle("Eval debt")).toBe("Copy of Eval debt");
    expect(duplicateDraftTitle("Copy of Eval debt")).toBe("Copy of Eval debt");
    expect(duplicateDraftTitle("")).toBe("Copy of Untitled");
  });
});
