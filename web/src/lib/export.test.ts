import { describe, expect, it } from "vitest";
import type { DraftRow } from "./content";
import {
  csvEscape,
  draftToMarkdown,
  draftToPlainText,
  draftsToCsv,
  selectedOwnedDrafts,
} from "./export";

function row(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: "d1",
    user_id: "u1",
    brand_id: "b1",
    platform: "linkedin",
    format: "text_post",
    topic: "Evals",
    title: 'Say "hello"',
    body: "Line 1\nLine 2, still going 🎯",
    status: "draft",
    metadata: { inputs: { pillarName: "Education" } },
    created_at: "2026-10-01",
    updated_at: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

describe("draft export", () => {
  it("escapes commas, quotes, and newlines in CSV", () => {
    expect(csvEscape('Say "hello", now')).toBe('"Say ""hello"", now"');
    const csv = draftsToCsv([row()]);
    expect(csv.split("\n")[0]).toContain("title,topic,platform");
    expect(csv).toContain('"Say ""hello"""');
    expect(csv).toContain("Line 1\nLine 2");
    expect(csv).not.toContain("u1");
    expect(csv).not.toContain("b1");
  });

  it("keeps unicode and line breaks in text and markdown", () => {
    const record = {
      title: "Eval debt",
      topic: "Evals",
      platform: "linkedin",
      format: "text_post",
      status: "Draft",
      pillar: "Education",
      updated_at: "2026-10-02",
      body: "Line 1\nLine 2 🎯",
    };
    expect(draftToPlainText(record)).toContain("🎯");
    expect(draftToMarkdown(record)).toContain("# Eval debt");
    expect(draftToMarkdown(record)).toContain("Line 2 🎯");
  });

  it("exports only selected owned rows", () => {
    const rows = [row(), row({ id: "d2", user_id: "other" }), row({ id: "d3", title: "Keep" })];
    const selected = selectedOwnedDrafts(rows, ["d1", "d2", "d3", "missing"], "u1");
    expect(selected.map((item) => item.id)).toEqual(["d1", "d3"]);
  });
});

describe("print sanitisation", () => {
  it("escapes HTML in print documents", async () => {
    const { escapeHtml } = await import("./export");
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });
});
