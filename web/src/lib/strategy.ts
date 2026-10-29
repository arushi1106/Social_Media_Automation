import { isOwnedBy, type CreateFormState, type DraftRow } from "@/lib/content";
import { isOwnedPillar, type ContentPillar } from "@/lib/pillars";

export type DraftPillarKind = "live" | "former" | "unassigned";

export type StrategyMixRow = {
  key: string;
  kind: DraftPillarKind;
  pillarId: string;
  name: string;
  description: string;
  draftCount: number;
  shareOfDrafts: number;
};

export type StrategyGap = {
  id: string;
  title: string;
  evidence: string;
};

export type StrategyRecommendation = {
  id: string;
  title: string;
  evidence: string;
  action: string;
  href: string;
};

export type StrategyReport = {
  pillarCount: number;
  draftCount: number;
  representedPillarCount: number;
  emptyPillarCount: number;
  unassignedDraftCount: number;
  formerDraftCount: number;
  mix: StrategyMixRow[];
  gaps: StrategyGap[];
  recommendations: StrategyRecommendation[];
  limitations: string[];
};

export type StrategySourceDraft = Pick<DraftRow, "id" | "user_id" | "metadata">;

const MAX_RECOMMENDATIONS = 4;
const MAX_EMPTY_PILLAR_RECS = 2;

export function createDraftHrefForPillar(pillarId: string): string {
  return `/studio/create?pillar=${encodeURIComponent(pillarId)}`;
}

export function draftInputsFromMetadata(metadata: DraftRow["metadata"]): Partial<CreateFormState> {
  if (!metadata || typeof metadata !== "object") return {};
  const inputs = metadata.inputs;
  if (!inputs || typeof inputs !== "object") return {};
  return inputs as Partial<CreateFormState>;
}

export function extractDraftPillar(row: StrategySourceDraft): {
  pillarId: string;
  pillarName: string;
  pillarDescription: string;
} {
  const inputs = draftInputsFromMetadata(row.metadata);
  return {
    pillarId: (inputs.pillarId ?? "").trim(),
    pillarName: (inputs.pillarName ?? "").trim(),
    pillarDescription: (inputs.pillarDescription ?? "").trim(),
  };
}

function uniqueOwnedDrafts(drafts: StrategySourceDraft[], sessionUserId: string): StrategySourceDraft[] {
  const seen = new Set<string>();
  const unique: StrategySourceDraft[] = [];
  for (const row of drafts) {
    if (!isOwnedBy(row, sessionUserId) || seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }
  return unique;
}

function ownedPillars(pillars: ContentPillar[], sessionUserId: string, brandId: string): ContentPillar[] {
  return pillars.filter(
    (item) => isOwnedPillar(item, sessionUserId) && Boolean(brandId) && item.brand_id === brandId,
  );
}

function share(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

export function buildStrategyReport(options: {
  pillars: ContentPillar[];
  drafts: StrategySourceDraft[];
  sessionUserId: string;
  brandId: string;
}): StrategyReport {
  const pillars = ownedPillars(options.pillars, options.sessionUserId, options.brandId);
  const drafts = uniqueOwnedDrafts(options.drafts, options.sessionUserId);
  const liveById = new Map(pillars.map((item) => [item.id, item]));

  const counts = new Map<string, number>();
  let unassignedDraftCount = 0;
  let formerDraftCount = 0;
  const formerMeta = new Map<string, { name: string; description: string }>();

  for (const draft of drafts) {
    const ref = extractDraftPillar(draft);
    if (!ref.pillarId) {
      unassignedDraftCount += 1;
      continue;
    }
    const live = liveById.get(ref.pillarId);
    if (live) {
      counts.set(live.id, (counts.get(live.id) ?? 0) + 1);
      continue;
    }
    formerDraftCount += 1;
    const existing = formerMeta.get(ref.pillarId);
    if (!existing) {
      formerMeta.set(ref.pillarId, {
        name: ref.pillarName || "Removed pillar",
        description: ref.pillarDescription,
      });
    }
    counts.set(`former:${ref.pillarId}`, (counts.get(`former:${ref.pillarId}`) ?? 0) + 1);
  }

  const liveMix: StrategyMixRow[] = pillars.map((item) => ({
    key: item.id,
    kind: "live" as const,
    pillarId: item.id,
    name: item.name,
    description: item.description,
    draftCount: counts.get(item.id) ?? 0,
    shareOfDrafts: share(counts.get(item.id) ?? 0, drafts.length),
  }));

  const formerMix: StrategyMixRow[] = [...formerMeta.entries()].map(([id, meta]) => {
    const draftCount = counts.get(`former:${id}`) ?? 0;
    return {
      key: `former:${id}`,
      kind: "former" as const,
      pillarId: id,
      name: meta.name,
      description: meta.description,
      draftCount,
      shareOfDrafts: share(draftCount, drafts.length),
    };
  });

  const mix: StrategyMixRow[] = [
    ...liveMix,
    ...formerMix,
    ...(drafts.length > 0 || unassignedDraftCount > 0
      ? [
          {
            key: "unassigned",
            kind: "unassigned" as const,
            pillarId: "",
            name: "Unassigned drafts",
            description: "Saved drafts with no pillar id in metadata, including older drafts.",
            draftCount: unassignedDraftCount,
            shareOfDrafts: share(unassignedDraftCount, drafts.length),
          },
        ]
      : []),
  ];

  const emptyLive = liveMix.filter((row) => row.draftCount === 0);
  const representedPillarCount = liveMix.filter((row) => row.draftCount > 0).length;

  const gaps: StrategyGap[] = [];
  if (pillars.length === 0) {
    gaps.push({
      id: "no-pillars",
      title: "No content pillars saved",
      evidence: "Brand settings has 0 content pillars, so there is no pillar mix to compare.",
    });
  }
  if (drafts.length === 0) {
    gaps.push({
      id: "no-drafts",
      title: "No saved drafts yet",
      evidence:
        "This view counts saved content_items rows only. Planned ideas and unsaved editor rewrites are not drafts.",
    });
  }
  for (const row of emptyLive) {
    gaps.push({
      id: `empty-${row.pillarId}`,
      title: `No saved drafts for ${row.name}`,
      evidence: `0 of ${drafts.length} saved drafts have this pillar id in their metadata.`,
    });
  }
  if (unassignedDraftCount > 0) {
    gaps.push({
      id: "unassigned",
      title: "Some saved drafts are unassigned",
      evidence: `${unassignedDraftCount} of ${drafts.length} saved drafts have no pillar id (including older drafts). Associations are not inferred from topics.`,
    });
  }
  if (formerDraftCount > 0) {
    gaps.push({
      id: "former",
      title: "Some drafts reference a removed pillar",
      evidence: `${formerDraftCount} saved draft${formerDraftCount === 1 ? "" : "s"} still have a pillar snapshot after that pillar was removed from Brand settings.`,
    });
  }

  const liveCounts = liveMix.map((row) => row.draftCount);
  const maxLive = liveCounts.length ? Math.max(...liveCounts) : 0;
  const minLive = liveCounts.length ? Math.min(...liveCounts) : 0;
  if (pillars.length >= 2 && drafts.length > 0 && maxLive - minLive >= 2) {
    const fewest = liveMix.filter((row) => row.draftCount === minLive);
    gaps.push({
      id: "relative-few",
      title: "Uneven mix among your own saved drafts",
      evidence: `${fewest.map((row) => row.name).join(", ")} ${fewest.length === 1 ? "has" : "have"} ${minLive} saved draft${minLive === 1 ? "" : "s"} versus a high of ${maxLive} on another pillar. This is a comparison of your tagged drafts, not a rule that pillars should be equal, and not performance.`,
    });
  }

  const recommendations = buildRecommendations({
    pillars,
    liveMix,
    emptyLive,
    drafts: drafts.length,
    unassignedDraftCount,
    formerDraftCount,
    maxLive,
  });

  return {
    pillarCount: pillars.length,
    draftCount: drafts.length,
    representedPillarCount,
    emptyPillarCount: emptyLive.length,
    unassignedDraftCount,
    formerDraftCount,
    mix,
    gaps,
    recommendations,
    limitations: [
      "Counts come from your saved drafts and content pillars. They are not audience, engagement, or publishing metrics.",
      "Planned Idea Bank items and weekly planner slots are not counted as drafts.",
      "Idea Bank free-text pillar labels are not treated as content pillar ids.",
      "Missing pillar tags are left unassigned. Topics are not used to guess a pillar.",
      "A relatively low draft count is not underperformance; there is no engagement data in this app.",
    ],
  };
}

function buildRecommendations(options: {
  pillars: ContentPillar[];
  liveMix: StrategyMixRow[];
  emptyLive: StrategyMixRow[];
  drafts: number;
  unassignedDraftCount: number;
  formerDraftCount: number;
  maxLive: number;
}): StrategyRecommendation[] {
  const recs: StrategyRecommendation[] = [];

  if (options.pillars.length === 0) {
    recs.push({
      id: "add-pillars",
      title: "Add content pillars before judging mix",
      evidence: "You have 0 saved content pillars.",
      action: "Add recurring themes in Brand settings.",
      href: "/studio/brand#content-pillars",
    });
  }

  if (options.drafts === 0 && options.pillars.length > 0) {
    const first = options.pillars[0];
    recs.push({
      id: "first-draft",
      title: "You have no saved drafts yet. Start with one of your existing pillars.",
      evidence: `You have ${options.pillars.length} saved pillar${options.pillars.length === 1 ? "" : "s"} and 0 saved drafts.`,
      action: `Create an introductory draft for ${first.name}.`,
      href: createDraftHrefForPillar(first.id),
    });
  }

  if (options.drafts > 0) {
    for (const row of options.emptyLive.slice(0, MAX_EMPTY_PILLAR_RECS)) {
      if (recs.length >= MAX_RECOMMENDATIONS) break;
      recs.push({
        id: `create-${row.pillarId}`,
        title: `You have not saved any drafts for ${row.name}. Consider creating an introductory post.`,
        evidence: `0 of ${options.drafts} saved drafts are tagged with this pillar.`,
        action: `Open Create with ${row.name} selected.`,
        href: createDraftHrefForPillar(row.pillarId),
      });
    }
  }

  if (
    options.drafts > 0 &&
    options.emptyLive.length > MAX_EMPTY_PILLAR_RECS &&
    recs.length < MAX_RECOMMENDATIONS
  ) {
    recs.push({
      id: "more-empty",
      title: "Several pillars still have no saved drafts",
      evidence: `${options.emptyLive.length} of ${options.pillars.length} live pillars have 0 associated saved drafts.`,
      action: "Review pillars in Brand settings, then create a draft for one of them.",
      href: "/studio/brand#content-pillars",
    });
  }

  const assignedLive = options.liveMix.reduce((sum, row) => sum + row.draftCount, 0);
  const dominant = options.liveMix.find((row) => row.draftCount === options.maxLive && options.maxLive > 0);
  const alternative = options.liveMix
    .filter((row) => row.pillarId !== dominant?.pillarId)
    .sort((a, b) => a.draftCount - b.draftCount)[0];
  if (
    recs.length < MAX_RECOMMENDATIONS &&
    dominant &&
    alternative &&
    assignedLive >= 2 &&
    dominant.draftCount >= Math.ceil(assignedLive / 2) &&
    dominant.draftCount > alternative.draftCount
  ) {
    recs.push({
      id: "balance",
      title: `Most of your saved drafts are associated with ${dominant.name}. Consider whether you want to develop ${alternative.name} next.`,
      evidence: `${dominant.draftCount} of ${assignedLive} drafts tagged to a live pillar are ${dominant.name}. ${alternative.name} has ${alternative.draftCount}. This is your own mix, not a best-practice split.`,
      action: `Create a draft for ${alternative.name}.`,
      href: createDraftHrefForPillar(alternative.pillarId),
    });
  }

  if (options.unassignedDraftCount > 0 && recs.length < MAX_RECOMMENDATIONS) {
    recs.push({
      id: "review-unassigned",
      title: "You have unassigned drafts. Review whether any belong to an existing pillar.",
      evidence: `${options.unassignedDraftCount} saved draft${options.unassignedDraftCount === 1 ? "" : "s"} have no pillar id in metadata.`,
      action: "Open saved drafts. This page does not retag them for you.",
      href: "/studio/drafts",
    });
  }

  if (options.formerDraftCount > 0 && recs.length < MAX_RECOMMENDATIONS) {
    recs.push({
      id: "former-snapshot",
      title: "Some drafts still reference a pillar that was removed",
      evidence: `${options.formerDraftCount} saved draft${options.formerDraftCount === 1 ? "" : "s"} keep a pillar snapshot after the live row was deleted.`,
      action: "Review those drafts, or add the theme again in Brand settings.",
      href: "/studio/drafts",
    });
  }

  if (options.drafts > 0 && recs.length < MAX_RECOMMENDATIONS) {
    recs.push({
      id: "ideas",
      title: "Capture the next topic in Idea Bank if you are not ready to draft",
      evidence: "Recommendations here are counts only. Idea Bank still stores suggestions, not posts.",
      action: "Open Idea Bank to save a topic (its free-text pillar field is not a content pillar id).",
      href: "/studio/ideas",
    });
  }

  return recs.slice(0, MAX_RECOMMENDATIONS);
}
