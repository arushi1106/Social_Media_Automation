import { flattenGeneratedText, humanStatus, type DraftRow } from "@/lib/content";
import { extractDraftPillar } from "@/lib/strategy";
import { contentFromRow } from "@/lib/content";

export const MAX_EXPORT_ROWS = 100;

export type ExportDraft = {
  title: string;
  topic: string;
  platform: string;
  format: string;
  status: string;
  pillar: string;
  updated_at: string;
  body: string;
};

export function csvEscape(value: string): string {
  const text = value.replace(/\r\n/g, "\n");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function draftToExportRecord(row: DraftRow): ExportDraft {
  const content = contentFromRow(row);
  const pillar = extractDraftPillar(row);
  return {
    title: (row.title || "Untitled").trim(),
    topic: (row.topic || "").trim(),
    platform: row.platform,
    format: row.format,
    status: humanStatus(row.status),
    pillar: pillar.pillarName || (pillar.pillarId ? "Removed pillar" : "Unassigned"),
    updated_at: row.updated_at,
    body: content ? flattenGeneratedText(content) : (row.body || ""),
  };
}

export function draftToPlainText(record: ExportDraft): string {
  return [
    record.title,
    `Platform: ${record.platform}`,
    `Format: ${record.format}`,
    `Status: ${record.status}`,
    record.pillar ? `Pillar: ${record.pillar}` : "",
    record.topic ? `Topic: ${record.topic}` : "",
    record.updated_at ? `Updated: ${record.updated_at}` : "",
    "",
    record.body,
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n")
    .trimEnd();
}

export function draftToMarkdown(record: ExportDraft): string {
  const meta = [
    `- Platform: ${record.platform}`,
    `- Format: ${record.format}`,
    `- Status: ${record.status}`,
    record.pillar ? `- Pillar: ${record.pillar}` : "",
    record.topic ? `- Topic: ${record.topic}` : "",
    record.updated_at ? `- Updated: ${record.updated_at}` : "",
  ].filter(Boolean);
  return [`# ${record.title}`, "", ...meta, "", record.body].join("\n");
}

export function draftsToCsv(rows: DraftRow[]): string {
  const header = ["title", "topic", "platform", "format", "status", "pillar", "updated_at", "body"];
  const lines = [header.join(",")];
  rows.slice(0, MAX_EXPORT_ROWS).forEach((row) => {
    const record = draftToExportRecord(row);
    lines.push(
      [
        record.title,
        record.topic,
        record.platform,
        record.format,
        record.status,
        record.pillar,
        record.updated_at,
        record.body,
      ]
        .map(csvEscape)
        .join(","),
    );
  });
  return lines.join("\n");
}

export function selectedOwnedDrafts(
  all: DraftRow[],
  selectedIds: string[],
  sessionUserId: string,
): DraftRow[] {
  const allowed = new Set(selectedIds);
  return all.filter((row) => allowed.has(row.id) && row.user_id === sessionUserId).slice(0, MAX_EXPORT_ROWS);
}

export function exportFilename(kind: "txt" | "md" | "csv", title?: string): string {
  const slug = (title || "drafts")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "drafts"}.${kind}`;
}

export function downloadTextFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printDraftDocument(record: ExportDraft): void {
  const body = escapeHtml(draftToPlainText(record));
  const title = escapeHtml(record.title);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Georgia,serif;max-width:40rem;margin:2rem auto;white-space:pre-wrap;line-height:1.5} @media print { body { margin: 0; } }</style>
</head><body>${body}</body></html>`;
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Allow pop-ups to print this draft.");
  }
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}
