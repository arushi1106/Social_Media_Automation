import { describe, expect, it } from "vitest";
import { isStudioNavCurrent } from "./studio-nav";

describe("isStudioNavCurrent", () => {
  it("marks overview only on the studio root", () => {
    expect(isStudioNavCurrent("/studio", "/studio")).toBe(true);
    expect(isStudioNavCurrent("/studio/drafts", "/studio")).toBe(false);
  });

  it("marks nested draft editor under Drafts", () => {
    expect(isStudioNavCurrent("/studio/drafts/abc", "/studio/drafts")).toBe(true);
    expect(isStudioNavCurrent("/studio/create", "/studio/drafts")).toBe(false);
  });

  it("marks Templates without treating it as Overview", () => {
    expect(isStudioNavCurrent("/studio/templates", "/studio/templates")).toBe(true);
    expect(isStudioNavCurrent("/studio/templates", "/studio")).toBe(false);
  });
});
