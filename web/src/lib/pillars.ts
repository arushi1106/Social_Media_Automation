export const MIN_PILLARS = 0;
export const MAX_PILLARS = 8;
export const MIN_PILLAR_NAME = 1;
export const MAX_PILLAR_NAME = 80;
export const MIN_PILLAR_DESCRIPTION = 1;
export const MAX_PILLAR_DESCRIPTION = 400;

export type ContentPillar = {
  id: string;
  user_id: string;
  brand_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type PillarDraft = {
  name: string;
  description: string;
};

export type PillarFieldErrors = {
  name?: string;
  description?: string;
  form?: string;
};

export type PillarWritePayload = {
  user_id: string;
  brand_id: string;
  name: string;
  description: string;
};

export function emptyPillarDraft(): PillarDraft {
  return { name: "", description: "" };
}

export function validatePillarDraft(
  draft: PillarDraft,
  existing: ContentPillar[],
  options: { editingId?: string } = {},
): PillarFieldErrors {
  const errors: PillarFieldErrors = {};
  const name = draft.name.trim();
  const description = draft.description.trim();

  if (name.length < MIN_PILLAR_NAME) {
    errors.name = "Enter a pillar name.";
  } else if (name.length > MAX_PILLAR_NAME) {
    errors.name = `Keep names under ${MAX_PILLAR_NAME} characters.`;
  }

  if (description.length < MIN_PILLAR_DESCRIPTION) {
    errors.description = "Describe what this pillar covers.";
  } else if (description.length > MAX_PILLAR_DESCRIPTION) {
    errors.description = `Keep descriptions under ${MAX_PILLAR_DESCRIPTION} characters.`;
  }

  const duplicate = existing.some(
    (item) =>
      item.id !== options.editingId && item.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (name && duplicate) {
    errors.name = "You already have a pillar with that name.";
  }

  if (!options.editingId && existing.length >= MAX_PILLARS) {
    errors.form = `You can save up to ${MAX_PILLARS} pillars. Delete one to add another.`;
  }

  return errors;
}

export function canAddPillar(existingCount: number): boolean {
  return existingCount < MAX_PILLARS;
}

export function toPillarWritePayload(
  draft: PillarDraft,
  sessionUserId: string,
  brandId: string,
): PillarWritePayload {
  if (!sessionUserId) {
    throw new Error("Authenticated user id is required.");
  }
  if (!brandId) {
    throw new Error("A saved brand is required.");
  }
  return {
    user_id: sessionUserId,
    brand_id: brandId,
    name: draft.name.trim(),
    description: draft.description.trim(),
  };
}

export function isOwnedPillar(row: { user_id: string }, sessionUserId: string): boolean {
  return Boolean(sessionUserId) && row.user_id === sessionUserId;
}

export function emptyPillarsCopy(count: number): string {
  if (count === 0) {
    return `No content pillars yet. Add 1–${MAX_PILLARS} recurring themes (for example Education, Product, or Personal stories).`;
  }
  return `${count} of ${MAX_PILLARS} pillars saved.`;
}

export type TrustedPillarContext = {
  id: string;
  name: string;
  description: string;
};

export type ResolvePillarResult =
  | { status: "none" }
  | { status: "ok"; pillar: TrustedPillarContext }
  | { status: "unavailable" };

export const MISSING_PILLAR_MESSAGE =
  "That content pillar is no longer available. Choose another or continue without one.";

export function resolveTrustedPillar(
  requestedId: string | undefined,
  owned: ContentPillar[],
  sessionUserId: string,
  brandId: string,
): ResolvePillarResult {
  const id = (requestedId ?? "").trim();
  if (!id) {
    return { status: "none" };
  }
  const match = owned.find((item) => item.id === id);
  if (
    !match ||
    !isOwnedPillar(match, sessionUserId) ||
    !brandId ||
    match.brand_id !== brandId
  ) {
    return { status: "unavailable" };
  }
  return {
    status: "ok",
    pillar: {
      id: match.id,
      name: match.name,
      description: match.description,
    },
  };
}

export function pillarContextForRewrite(
  requestedId: string | undefined,
  owned: ContentPillar[],
  sessionUserId: string,
  brandId: string,
  snapshot?: { name?: string; description?: string },
): TrustedPillarContext | null {
  const resolved = resolveTrustedPillar(requestedId, owned, sessionUserId, brandId);
  if (resolved.status === "ok") {
    return resolved.pillar;
  }
  const id = (requestedId ?? "").trim();
  const name = (snapshot?.name ?? "").trim();
  if (resolved.status === "unavailable" && id && name) {
    return {
      id,
      name,
      description: (snapshot?.description ?? "").trim(),
    };
  }
  return null;
}

export function toApiPillar(pillar: TrustedPillarContext | null) {
  if (!pillar) return null;
  return { id: pillar.id };
}
