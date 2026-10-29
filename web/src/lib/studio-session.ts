export const LAST_DRAFT_STORAGE_KEY = "studio.lastDraftId";

export function rememberLastDraftId(draftId: string): void {
  if (typeof window === "undefined" || !draftId) return;
  window.sessionStorage.setItem(LAST_DRAFT_STORAGE_KEY, draftId);
}

export function readLastDraftId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(LAST_DRAFT_STORAGE_KEY);
}

export function lastDraftHref(draftId: string | null): string | null {
  if (!draftId || !/^[0-9a-f-]{36}$/i.test(draftId)) return null;
  return `/studio/drafts/${draftId}`;
}
