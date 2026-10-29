import { describe, expect, it } from "vitest";
import { contentEquals, type GeneratedContent } from "./content";
import {
  applyHookToContent,
  hookAngleLabel,
  isVariationAngle,
  labelsForVariationAngle,
  openingText,
  parseHookOptions,
  variationDifference,
} from "./variations";

const post: GeneratedContent = {
  title: "Eval debt",
  body: "Teams skip evals.\n\nStart with a golden set.\n\nComment if you want the template.",
  hashtags: ["#ai"],
  slides: [],
  script: null,
  platform: "linkedin",
  format: "text_post",
  status: "draft",
};

describe("variation angles", () => {
  it("accepts each supported creative angle", () => {
    expect(
      ["distinct", "mixed", "educational", "storytelling", "opinion", "practical", "question"].every(
        isVariationAngle,
      ),
    ).toBe(true);
    expect(isVariationAngle("viral")).toBe(false);
    expect(labelsForVariationAngle("mixed")).toEqual(["educational", "storytelling", "practical"]);
    expect(labelsForVariationAngle("opinion")).toEqual(["opinion", "opinion", "opinion"]);
  });
});

describe("applyHookToContent", () => {
  it("replaces only the opening of a text post and leaves the rest", () => {
    const next = applyHookToContent(post, "Stop arguing about quality.");
    expect(openingText(next)).toBe("Stop arguing about quality.");
    expect(next.body).toContain("Start with a golden set.");
    expect(next.body).toContain("Comment if you want the template.");
    expect(next.title).toBe(post.title);
    expect(next.hashtags).toEqual(post.hashtags);
    expect(contentEquals(post, post)).toBe(true);
    expect(contentEquals(post, next)).toBe(false);
  });

  it("replaces script.hook only", () => {
    const script: GeneratedContent = {
      ...post,
      format: "script",
      script: { hook: "Old hook", body: "Keep this body", cta: "Follow" },
      body: "logline",
    };
    const next = applyHookToContent(script, "New hook in two seconds");
    expect(next.script?.hook).toBe("New hook in two seconds");
    expect(next.script?.body).toBe("Keep this body");
    expect(next.script?.cta).toBe("Follow");
  });

  it("replaces the first carousel slide text only", () => {
    const carousel: GeneratedContent = {
      ...post,
      format: "carousel",
      slides: [
        { title: "1", text: "Old open" },
        { title: "2", text: "Keep me" },
      ],
    };
    const next = applyHookToContent(carousel, "New open");
    expect(next.slides[0].text).toBe("New open");
    expect(next.slides[1].text).toBe("Keep me");
  });
});

describe("comparison summaries", () => {
  it("describes wording differences without performance claims", () => {
    const alt = { ...post, title: "A better title", body: "A new opening.\n\nStart with a golden set." };
    const summary = variationDifference(post, alt, "Educational / explainer");
    expect(summary).toMatch(/Educational/);
    expect(summary).toMatch(/title is worded differently/);
    expect(summary).toMatch(/opening is different/);
    expect(summary).not.toMatch(/will get more engagement|will perform best/i);
    expect(summary).toMatch(/not a prediction of engagement/);
  });
});

describe("parseHookOptions", () => {
  it("drops empty and malformed hooks", () => {
    expect(parseHookOptions({ hooks: [{ text: "A hook" }, { text: "" }, "Also"] })).toEqual([
      { text: "A hook", angle: "" },
      { text: "Also", angle: "" },
    ]);
    expect(parseHookOptions({})).toEqual([]);
    expect(hookAngleLabel("question")).toMatch(/Question/);
  });
});
