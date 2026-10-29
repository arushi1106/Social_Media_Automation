import { extractDraftPillar } from "@/lib/strategy";
import type { DraftRow } from "@/lib/content";
import type { IdeaRecord } from "@/lib/ideas";
import type { ContentPillar } from "@/lib/pillars";
import type { ContentProject } from "@/lib/projects";
import { draftsForProject } from "@/lib/projects";

export type WorkflowStage = "idea" | "drafting" | "ready";

export function draftStage(status: string): Exclude<WorkflowStage, "idea"> {
  return status === "ready" ? "ready" : "drafting";
}

export function stageLabel(stage: WorkflowStage): string {
  if (stage === "idea") return "Idea";
  if (stage === "ready") return "Ready for use";
  return "Drafting";
}

export type ProductionSnapshot = {
  ideaCount: number;
  draftingCount: number;
  readyCount: number;
  totalDrafts: number;
  recentDrafts: DraftRow[];
  byPlatform: { platform: string; count: number }[];
  byPillar: { key: string; label: string; count: number }[];
  unfinishedProjects: { id: string; name: string; drafting: number; ideas: number }[];
};

export function buildProductionSnapshot(
  drafts: DraftRow[],
  ideas: IdeaRecord[],
  pillars: ContentPillar[],
  projects: ContentProject[],
): ProductionSnapshot {
  const drafting = drafts.filter((row) => draftStage(row.status) === "drafting");
  const ready = drafts.filter((row) => draftStage(row.status) === "ready");
  const openIdeas = ideas.filter((idea) => idea.status === "saved");
  const liveById = new Map(pillars.map((item) => [item.id, item]));
  const platformCounts = new Map<string, number>();
  drafts.forEach((row) => {
    platformCounts.set(row.platform, (platformCounts.get(row.platform) ?? 0) + 1);
  });
  const pillarCounts = new Map<string, { label: string; count: number }>();
  drafts.forEach((row) => {
    const ref = extractDraftPillar(row);
    const key = ref.pillarId || "unassigned";
    const live = ref.pillarId ? liveById.get(ref.pillarId) : null;
    const label = live?.name ?? (ref.pillarName ? `${ref.pillarName} (removed)` : "Unassigned");
    const current = pillarCounts.get(key) ?? { label, count: 0 };
    current.count += 1;
    pillarCounts.set(key, current);
  });
  const unfinishedProjects = projects
    .map((project) => {
      const linked = draftsForProject(drafts, project.id);
      const draftingCount = linked.filter((row) => draftStage(row.status) === "drafting").length;
      const ideaCount = ideas.filter((idea) => idea.projectId === project.id && idea.status === "saved").length;
      return { id: project.id, name: project.name, drafting: draftingCount, ideas: ideaCount };
    })
    .filter((item) => item.drafting > 0 || item.ideas > 0);

  return {
    ideaCount: openIdeas.length,
    draftingCount: drafting.length,
    readyCount: ready.length,
    totalDrafts: drafts.length,
    recentDrafts: [...drafts].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
    byPlatform: [...platformCounts.entries()].map(([platform, count]) => ({ platform, count })),
    byPillar: [...pillarCounts.entries()].map(([key, value]) => ({ key, label: value.label, count: value.count })),
    unfinishedProjects,
  };
}

export function productionEmptyCopy(snapshot: ProductionSnapshot): string {
  if (snapshot.totalDrafts === 0 && snapshot.ideaCount === 0) {
    return "No saved work yet. Discover an idea or create a draft. Nothing is published from this board.";
  }
  if (snapshot.totalDrafts === 0 && snapshot.ideaCount > 0) {
    return "You have saved ideas but no drafts yet. Open an idea and create a draft when you are ready.";
  }
  if (snapshot.draftingCount === 0 && snapshot.readyCount > 0) {
    return "All saved drafts are marked ready for use. That does not mean they were posted.";
  }
  return "";
}
