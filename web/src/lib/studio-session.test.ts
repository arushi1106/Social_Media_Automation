import { describe, expect, it } from "vitest";
import { lastDraftHref } from "./studio-session";

describe("lastDraftHref", () => {
  it("only links to a UUID-shaped draft id", () => {
    expect(lastDraftHref("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(
      "/studio/drafts/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    expect(lastDraftHref("../../evil")).toBeNull();
    expect(lastDraftHref("")).toBeNull();
    expect(lastDraftHref(null)).toBeNull();
  });
});
