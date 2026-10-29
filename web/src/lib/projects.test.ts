import { describe, expect, it } from "vitest";
import { emptyCreateForm, type DraftRow } from "./content";
import {
  briefExtraInstructions,
  briefTheme,
  createFormForProject,
  draftsForProject,
  ideasForProject,
  toProjectWritePayload,
  validateProjectDraft,
  type ContentProject,
} from "./projects";
import type { IdeaRecord } from "./ideas";

const project: ContentProject = {
  id: "proj-1",
  user_id: "session-user",
  brand_id: "brand-1",
  name: "Eval launch",
  objective: "Teach evals",
  audience: "Consultants",
  core_message: "Start with a golden set.",
  offer: "",
  desired_action: "Comment",
  pillar_id: "p1",
  platforms: ["linkedin"],
  tone: "direct",
  plan_start: "2026-11-01",
  plan_end: "2026-11-15",
  created_at: "2026-10-01",
  updated_at: "2026-10-01",
};

describe("content projects", () => {
  it("requires a name and rejects inverted planning dates", () => {
    expect(validateProjectDraft({ ...project, name: "", plan_start: "", plan_end: "" }).name).toBeTruthy();
    expect(
      validateProjectDraft({
        ...project,
        pillar_id: "",
        plan_start: "2026-11-20",
        plan_end: "2026-11-01",
      }).plan_end,
    ).toMatch(/end date/);
  });

  it("writes with the session user id", () => {
    const payload = toProjectWritePayload({ ...project, pillar_id: "p1" }, "session-user", "brand-1");
    expect(payload.user_id).toBe("session-user");
    expect(payload.brand_id).toBe("brand-1");
  });

  it("builds user-authored brief text and keeps dates as planning only", () => {
    const extra = briefExtraInstructions(project);
    expect(briefTheme(project)).toContain("Eval launch");
    expect(extra).toContain("not a publish schedule");
    expect(extra).toContain("Consultants");
    expect(extra).not.toMatch(/will perform|auto-publish/i);
  });

  it("associates drafts and ideas by stored project id without duplicating bodies", () => {
    const drafts: DraftRow[] = [
      {
        id: "d1",
        user_id: "session-user",
        brand_id: "brand-1",
        platform: "linkedin",
        format: "text_post",
        topic: "A",
        title: "A",
        body: "Body",
        status: "draft",
        metadata: { inputs: { projectId: "proj-1" } },
        created_at: "",
        updated_at: "",
      },
      {
        id: "d2",
        user_id: "session-user",
        brand_id: "brand-1",
        platform: "linkedin",
        format: "text_post",
        topic: "B",
        title: "B",
        body: "Body",
        status: "draft",
        metadata: { inputs: { projectId: "other" } },
        created_at: "",
        updated_at: "",
      },
    ];
    expect(draftsForProject(drafts, "proj-1").map((row) => row.id)).toEqual(["d1"]);
    const ideas = [
      { id: "i1", projectId: "proj-1" },
      { id: "i2", projectId: "" },
    ] as IdeaRecord[];
    expect(ideasForProject(ideas, "proj-1").map((row) => row.id)).toEqual(["i1"]);
  });

  it("prepares create form from a project without silently dropping pillar intent", () => {
    const form = createFormForProject(emptyCreateForm(["linkedin"]), project, ["linkedin"]);
    expect(form.projectId).toBe("proj-1");
    expect(form.pillarId).toBe("p1");
    expect(form.topic).toContain("golden set");
  });
});
