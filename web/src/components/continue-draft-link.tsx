"use client";

import { useSyncExternalStore } from "react";
import { ButtonLink } from "@/components/ui/button";
import { lastDraftHref, readLastDraftId } from "@/lib/studio-session";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getSnapshot() {
  return lastDraftHref(readLastDraftId());
}

function getServerSnapshot() {
  return null;
}

export function ContinueDraftLink() {
  const href = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!href) return null;

  return (
    <ButtonLink href={href} variant="ghost">
      Continue last draft
    </ButtonLink>
  );
}
