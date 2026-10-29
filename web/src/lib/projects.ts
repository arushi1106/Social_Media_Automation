import { isPlatform, type Platform } from "@/lib/brand";
import type { CreateFormState, DraftRow } from "@/lib/content";
import type { IdeaRecord } from "@/lib/ideas";

export const MAX_PROJECTS = 20;
export const MAX_PROJECT_NAME = 80;

export type ContentProject = {
  id: string;
  user_id: string;
  brand_id: string;
  name: string;
  objective: string;
  audience: string;
  core_message: string;
  offer: string;
  desired_action: string;
  pillar_id: string | null;
  platforms: Platform[];
  tone: string;
  plan_start: string | null;
  plan_end: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectDraft = {
  name: string;
  objective: string;
  audience: string;
  core_message: string;
  offer: string;
  desired_action: string;
  pillar_id: string;
  platforms: Platform[];
  tone: string;
  plan_start: string;
  plan_end: string;
};

export type ProjectFieldErrors = Partial<Record<keyof ProjectDraft | "form", string>>;

export function emptyProjectDraft(platforms: Platform[] = []): ProjectDraft {
  return {
    name: "",
    objective: "",
    audience: "",
    core_message: "",
    offer: "",
    desired_action: "",
    pillar_id: "",
    platforms,
    tone: "",
    plan_start: "",
    plan_end: "",
  };
}

export function canAddProject(count: number): boolean {
  return count < MAX_PROJECTS;
}

export function isOwnedProject(row: { user_id: string }, sessionUserId: string): boolean {
  return Boolean(sessionUserId) && row.user_id === sessionUserId;
}

export function validateProjectDraft(draft: ProjectDraft): ProjectFieldErrors {
  const errors: ProjectFieldErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = "Enter a project name.";
  else if (name.length > MAX_PROJECT_NAME) errors.name = `Keep names under ${MAX_PROJECT_NAME} characters.`;
  if (draft.objective.trim().length > 400) errors.objective = "Keep the objective under 400 characters.";
  if (draft.audience.trim().length > 400) errors.audience = "Keep the audience under 400 characters.";
  if (draft.core_message.trim().length > 400) errors.core_message = "Keep the core message under 400 characters.";
  if (draft.offer.trim().length > 400) errors.offer = "Keep the offer under 400 characters.";
  if (draft.desired_action.trim().length > 300) errors.desired_action = "Keep the desired action under 300 characters.";
  if (draft.tone.trim().length > 200) errors.tone = "Keep tone notes under 200 characters.";
  if (draft.platforms.some((item) => !isPlatform(item))) errors.platforms = "Choose supported platforms only.";
  if (draft.plan_start && draft.plan_end && draft.plan_end < draft.plan_start) {
    errors.plan_end = "The planning end date cannot be before the start date.";
  }
  return errors;
}

export function toProjectWritePayload(draft: ProjectDraft, sessionUserId: string, brandId: string) {
  if (!sessionUserId) throw new Error("Authenticated user id is required.");
  if (!brandId) throw new Error("A saved brand is required.");
  return {
    user_id: sessionUserId,
    brand_id: brandId,
    name: draft.name.trim(),
    objective: draft.objective.trim(),
    audience: draft.audience.trim(),
    core_message: draft.core_message.trim(),
    offer: draft.offer.trim(),
    desired_action: draft.desired_action.trim(),
    pillar_id: draft.pillar_id.trim() || null,
    platforms: draft.platforms.filter(isPlatform),
    tone: draft.tone.trim(),
    plan_start: draft.plan_start.trim() || null,
    plan_end: draft.plan_end.trim() || null,
  };
}

export function projectToDraft(row: ContentProject): ProjectDraft {
  return {
    name: row.name,
    objective: row.objective,
    audience: row.audience,
    core_message: row.core_message,
    offer: row.offer,
    desired_action: row.desired_action,
    pillar_id: row.pillar_id ?? "",
    platforms: row.platforms,
    tone: row.tone,
    plan_start: row.plan_start ?? "",
    plan_end: row.plan_end ?? "",
  };
}

export function briefTheme(project: Pick<ContentProject, "name" | "objective">): string {
  return [project.name.trim(), project.objective.trim()].filter(Boolean).join(" — ").slice(0, 400);
}

export function briefExtraInstructions(project: ContentProject): string {
  const lines = [
    `Content project: ${project.name}.`,
    project.objective ? `Objective: ${project.objective}` : "",
    project.audience ? `Target audience for this project: ${project.audience}` : "",
    project.core_message ? `Core message: ${project.core_message}` : "",
    project.offer ? `Offer or subject: ${project.offer}` : "",
    project.desired_action ? `Desired reader action: ${project.desired_action}` : "",
    project.tone ? `Tone or constraints for this project: ${project.tone}` : "",
    project.plan_start || project.plan_end
      ? `Planning window (not a publish schedule): ${project.plan_start || "open"} to ${project.plan_end || "open"}.`
      : "",
    "These are planning notes. Do not invent metrics or instruct the user to publish.",
  ];
  return lines.filter(Boolean).join("\n").slice(0, 2000);
}

export function draftsForProject(drafts: DraftRow[], projectId: string): DraftRow[] {
  const id = projectId.trim();
  if (!id) return [];
  return drafts.filter((row) => {
    const inputs = (row.metadata as { inputs?: { projectId?: string } } | null)?.inputs;
    return inputs?.projectId === id;
  });
}

export function ideasForProject(ideas: IdeaRecord[], projectId: string): IdeaRecord[] {
  const id = projectId.trim();
  if (!id) return [];
  return ideas.filter((idea) => idea.projectId === id);
}

export function createFormForProject(
  base: CreateFormState,
  project: ContentProject,
  allowedPlatforms: Platform[],
): CreateFormState {
  const platform =
    project.platforms.find((item) => allowedPlatforms.includes(item)) ?? base.platform;
  return {
    ...base,
    platform,
    topic: project.core_message || project.name,
    extraInstructions: briefExtraInstructions(project),
    projectId: project.id,
    pillarId: project.pillar_id ?? base.pillarId,
  };
}
