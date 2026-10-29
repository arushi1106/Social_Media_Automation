"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteStudioDraft, duplicateStudioDraft } from "@/app/studio/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { formatPlatform, isPlatform, type Platform } from "@/lib/brand";
import { formatLabel, humanStatus, isContentFormat, type DraftRow } from "@/lib/content";
import {
  LIBRARY_PAGE_SIZE,
  emptyLibraryFilters,
  filterLibraryDrafts,
  libraryFiltersAreClear,
  libraryPillarLabel,
  paginateLibrary,
  type LibraryFilters,
  type LibrarySort,
} from "@/lib/library";
import type { ContentPillar } from "@/lib/pillars";
import {
  downloadTextFile,
  draftsToCsv,
  draftToExportRecord,
  draftToMarkdown,
  draftToPlainText,
  exportFilename,
  selectedOwnedDrafts,
} from "@/lib/export";

const selectClass =
  "rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40";

export function DraftLibrary({
  drafts,
  pillars,
  sessionUserId,
  error,
}: {
  drafts: DraftRow[];
  pillars: ContentPillar[];
  sessionUserId: string;
  error: string | null;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<LibraryFilters>(emptyLibraryFilters);
  const [visibleCount, setVisibleCount] = useState(LIBRARY_PAGE_SIZE);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const liveById = useMemo(() => new Map(pillars.map((item) => [item.id, item])), [pillars]);
  const filtered = useMemo(
    () => filterLibraryDrafts(drafts, filters, pillars, sessionUserId),
    [drafts, filters, pillars, sessionUserId],
  );
  const page = paginateLibrary(filtered, visibleCount);
  const busy = pending !== null;

  function update<K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisibleCount(LIBRARY_PAGE_SIZE);
  }

  async function onDuplicate(id: string) {
    setPending(`copy-${id}`);
    setMessage(null);
    try {
      const result = await duplicateStudioDraft(id);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.push(`/studio/drafts/${result.id}`);
      router.refresh();
    } catch {
      setMessage("Could not duplicate that draft.");
    } finally {
      setPending(null);
    }
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((item) => item !== id);
    });
  }

  function onExportSelected(kind: "csv" | "txt" | "md") {
    const rows = selectedOwnedDrafts(drafts, selectedIds, sessionUserId);
    if (rows.length === 0) {
      setMessage("Select at least one of your drafts to export. Unselected drafts are not included.");
      return;
    }
    const confirmed = window.confirm(
      `Export ${rows.length} selected draft${rows.length === 1 ? "" : "s"} as ${kind.toUpperCase()}? Includes title, topic, platform, format, status, pillar, last updated, and body. User ids and secrets are not included. Saved drafts are not changed.`,
    );
    if (!confirmed) return;
    try {
      const contents =
        kind === "csv"
          ? draftsToCsv(rows)
          : rows
              .map((row) =>
                kind === "md"
                  ? draftToMarkdown(draftToExportRecord(row))
                  : draftToPlainText(draftToExportRecord(row)),
              )
              .join("\n\n---\n\n");
      const mime = kind === "csv" ? "text/csv" : kind === "md" ? "text/markdown" : "text/plain";
      downloadTextFile(exportFilename(kind, "studio-drafts"), contents, mime);
      setMessage(`Exported ${rows.length} draft${rows.length === 1 ? "" : "s"}. Library records were not changed.`);
    } catch {
      setMessage("Could not export the selected drafts.");
    }
  }

  async function onDelete(id: string, title: string) {
    const confirmed = window.confirm(
      `Delete “${title}”? This cannot be undone. Planner slots that pointed at it will keep the idea and drop the draft link.`,
    );
    if (!confirmed) return;
    setPending(`delete-${id}`);
    setMessage(null);
    try {
      const result = await deleteStudioDraft(id);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMessage("Draft deleted.");
      router.refresh();
    } catch {
      setMessage("Could not delete that draft.");
    } finally {
      setPending(null);
    }
  }

  if (error) {
    return (
      <p className="text-sm text-accent" role="alert">
        {error}
      </p>
    );
  }

  if (drafts.length === 0) {
    return (
      <Card className="max-w-xl">
        <p className="text-sm leading-6 text-ink/70">
          No drafts yet. Generate a post from your brand voice, then save it here. Nothing is published
          automatically.
        </p>
        <div className="mt-6">
          <ButtonLink href="/studio/create">Create a draft</ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-serif text-xl">Find drafts</h2>
        <p className="mt-1 text-sm text-ink/65">
          Search looks at title, topic, body, and pillar name (including removed-pillar snapshots).
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="md:col-span-2 lg:col-span-3">
            <Label htmlFor="library-search">Search</Label>
            <Input
              id="library-search"
              value={filters.query}
              onChange={(event) => update("query", event.target.value)}
              placeholder="Title, topic, body, or pillar"
            />
          </div>
          <div>
            <Label htmlFor="library-platform">Platform</Label>
            <select
              id="library-platform"
              className={`mt-1 w-full ${selectClass}`}
              value={filters.platform}
              onChange={(event) => update("platform", event.target.value)}
            >
              <option value="">All platforms</option>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>
          <div>
            <Label htmlFor="library-format">Format</Label>
            <select
              id="library-format"
              className={`mt-1 w-full ${selectClass}`}
              value={filters.format}
              onChange={(event) => update("format", event.target.value)}
            >
              <option value="">All formats</option>
              <option value="text_post">Text post</option>
              <option value="caption">Caption</option>
              <option value="carousel">Carousel outline</option>
              <option value="script">Short-video script</option>
            </select>
          </div>
          <div>
            <Label htmlFor="library-pillar">Content pillar</Label>
            <select
              id="library-pillar"
              className={`mt-1 w-full ${selectClass}`}
              value={filters.pillar}
              onChange={(event) => update("pillar", event.target.value)}
            >
              <option value="">All pillars</option>
              <option value="unassigned">Unassigned</option>
              <option value="former">Removed pillar snapshot</option>
              {pillars.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="library-status">Status</Label>
            <select
              id="library-status"
              className={`mt-1 w-full ${selectClass}`}
              value={filters.status}
              onChange={(event) => update("status", event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
            </select>
          </div>
          <div>
            <Label htmlFor="library-sort">Sort</Label>
            <select
              id="library-sort"
              className={`mt-1 w-full ${selectClass}`}
              value={filters.sort}
              onChange={(event) => update("sort", event.target.value as LibrarySort)}
            >
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFilters(emptyLibraryFilters());
              setVisibleCount(LIBRARY_PAGE_SIZE);
            }}
            disabled={libraryFiltersAreClear(filters)}
          >
            Clear filters
          </Button>
          <p className="text-sm text-ink/60">
            {filtered.length} of {drafts.length} drafts
          </p>
          <Button type="button" variant="ghost" onClick={() => onExportSelected("csv")} disabled={busy}>
            Export selected CSV
          </Button>
          <Button type="button" variant="ghost" onClick={() => onExportSelected("txt")} disabled={busy}>
            Export selected text
          </Button>
          <Button type="button" variant="ghost" onClick={() => onExportSelected("md")} disabled={busy}>
            Export selected Markdown
          </Button>
        </div>
      </Card>

      {message ? (
        <p className="text-sm text-ink/70" role="status">
          {message}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <Card className="max-w-xl">
          <p className="text-sm leading-6 text-ink/70">
            No drafts match these filters. Clear filters to see your full library.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {page.items.map((draft) => {
            const platform = isPlatform(draft.platform)
              ? formatPlatform(draft.platform as Platform)
              : draft.platform;
            const format = isContentFormat(draft.format) ? formatLabel(draft.format) : draft.format;
            const updated = draft.updated_at ? new Date(draft.updated_at).toLocaleString() : "";
            const label = libraryPillarLabel(draft, liveById);
            const title = draft.title || draft.topic || "Untitled";
            return (
              <li key={draft.id}>
                <article className="rounded-2xl border border-ink/10 bg-paper-raised p-5">
                  <div className="mb-3">
                    <label className="inline-flex items-center gap-2 text-sm text-ink/70">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(draft.id)}
                        onChange={(event) => toggleSelected(draft.id, event.target.checked)}
                        aria-label={`Select ${title} for export`}
                      />
                      Select for export
                    </label>
                  </div>
                  <Link
                    href={`/studio/drafts/${draft.id}`}
                    className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <p className="font-serif text-xl">{title}</p>
                    <p className="mt-1 text-sm text-ink/60">
                      {platform} · {format} · {humanStatus(draft.status)} · {label}
                      {updated ? ` · ${updated}` : ""}
                    </p>
                    {draft.topic ? (
                      <p className="mt-2 line-clamp-2 text-sm text-ink/70">{draft.topic}</p>
                    ) : null}
                  </Link>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ButtonLink href={`/studio/drafts/${draft.id}`} variant="ghost">
                      Open editor
                    </ButtonLink>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onDuplicate(draft.id)}
                      disabled={busy}
                    >
                      {pending === `copy-${draft.id}` ? "Duplicating…" : "Duplicate"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onDelete(draft.id, title)}
                      disabled={busy}
                    >
                      {pending === `delete-${draft.id}` ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {page.remaining > 0 ? (
        <Button type="button" variant="ghost" onClick={() => setVisibleCount((count) => count + LIBRARY_PAGE_SIZE)}>
          Show {Math.min(LIBRARY_PAGE_SIZE, page.remaining)} more
        </Button>
      ) : null}
    </div>
  );
}
