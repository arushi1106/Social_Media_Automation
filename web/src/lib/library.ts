import { isOwnedBy, type DraftRow } from "@/lib/content";
import { extractDraftPillar } from "@/lib/strategy";
import type { ContentPillar } from "@/lib/pillars";

export const LIBRARY_PAGE_SIZE = 40;

export type LibrarySort = "updated" | "created" | "title";

export type LibraryFilters = {
  query: string;
  platform: string;
  format: string;
  pillar: string;
  status: string;
  sort: LibrarySort;
};

export const emptyLibraryFilters = (): LibraryFilters => ({
  query: "",
  platform: "",
  format: "",
  pillar: "",
  status: "",
  sort: "updated",
});

export function libraryFiltersAreClear(filters: LibraryFilters): boolean {
  const empty = emptyLibraryFilters();
  return (
    filters.query.trim() === empty.query &&
    filters.platform === empty.platform &&
    filters.format === empty.format &&
    filters.pillar === empty.pillar &&
    filters.status === empty.status &&
    filters.sort === empty.sort
  );
}

export type LibraryPillarKind = "live" | "former" | "unassigned";

export function libraryPillarKind(row: DraftRow, liveIds: Set<string>): LibraryPillarKind {
  const ref = extractDraftPillar(row);
  if (!ref.pillarId) return "unassigned";
  if (liveIds.has(ref.pillarId)) return "live";
  return "former";
}

export function libraryPillarLabel(row: DraftRow, liveById: Map<string, ContentPillar>): string {
  const ref = extractDraftPillar(row);
  if (!ref.pillarId) return "Unassigned";
  const live = liveById.get(ref.pillarId);
  if (live) return live.name;
  return ref.pillarName ? `${ref.pillarName} (removed)` : "Removed pillar";
}

export function searchHaystack(row: DraftRow, liveById: Map<string, ContentPillar>): string {
  const pillar = libraryPillarLabel(row, liveById);
  return [row.title, row.topic, row.body, pillar].filter(Boolean).join("\n").toLowerCase();
}

export function matchesLibraryFilters(
  row: DraftRow,
  filters: LibraryFilters,
  liveById: Map<string, ContentPillar>,
  sessionUserId: string,
): boolean {
  if (!isOwnedBy(row, sessionUserId)) return false;
  const query = filters.query.trim().toLowerCase();
  if (query && !searchHaystack(row, liveById).includes(query)) return false;
  if (filters.platform && row.platform !== filters.platform) return false;
  if (filters.format && row.format !== filters.format) return false;
  if (filters.status && row.status !== filters.status) return false;
  if (filters.pillar) {
    const liveIds = new Set(liveById.keys());
    const kind = libraryPillarKind(row, liveIds);
    const ref = extractDraftPillar(row);
    if (filters.pillar === "unassigned") {
      if (kind !== "unassigned") return false;
    } else if (filters.pillar === "former") {
      if (kind !== "former") return false;
    } else if (ref.pillarId !== filters.pillar || kind !== "live") {
      return false;
    }
  }
  return true;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function sortLibraryDrafts(rows: DraftRow[], sort: LibrarySort): DraftRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === "created") {
      const byDate = (b.created_at || "").localeCompare(a.created_at || "");
      return byDate || a.id.localeCompare(b.id);
    }
    if (sort === "title") {
      const left = (a.title || a.topic || "").trim() || "Untitled";
      const right = (b.title || b.topic || "").trim() || "Untitled";
      const byTitle = compareText(left, right);
      return byTitle || a.id.localeCompare(b.id);
    }
    const byUpdated = (b.updated_at || "").localeCompare(a.updated_at || "");
    return byUpdated || a.id.localeCompare(b.id);
  });
  return copy;
}

export function filterLibraryDrafts(
  drafts: DraftRow[],
  filters: LibraryFilters,
  pillars: ContentPillar[],
  sessionUserId: string,
): DraftRow[] {
  const liveById = new Map(pillars.map((item) => [item.id, item]));
  const matched = drafts.filter((row) => matchesLibraryFilters(row, filters, liveById, sessionUserId));
  return sortLibraryDrafts(matched, filters.sort);
}

export function paginateLibrary(rows: DraftRow[], visibleCount: number): {
  items: DraftRow[];
  remaining: number;
} {
  const limit = Math.max(LIBRARY_PAGE_SIZE, visibleCount);
  return {
    items: rows.slice(0, limit),
    remaining: Math.max(0, rows.length - limit),
  };
}

export function duplicateDraftTitle(title: string | null): string {
  const base = (title || "Untitled").trim() || "Untitled";
  if (base.toLowerCase().startsWith("copy of ")) return base;
  return `Copy of ${base}`;
}
