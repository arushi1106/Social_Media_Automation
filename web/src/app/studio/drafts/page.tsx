import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { listOwnedDrafts } from "@/app/studio/actions";
import { listOwnedPillars } from "@/app/studio/brand/pillars-actions";
import { DraftLibrary } from "@/components/draft-library";
import { StudioShell } from "@/components/studio-shell";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { isOwnedBy } from "@/lib/content";
import { isOwnedPillar } from "@/lib/pillars";

export default function DraftsPage() {
  return (
    <Suspense fallback={<StudioShell title="Loading drafts…" />}>
      <DraftsSession />
    </Suspense>
  );
}

async function DraftsSession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys to list drafts.</p>
      </StudioShell>
    );
  }
  if (!user) {
    redirect("/login?next=/studio/drafts");
  }
  if (!brand) {
    redirect("/onboarding");
  }

  const [{ drafts, error }, { pillars }] = await Promise.all([listOwnedDrafts(), listOwnedPillars()]);
  const owned = drafts.filter((row) => isOwnedBy(row, user.id));
  const ownedPillars = pillars.filter((row) => isOwnedPillar(row, user.id) && row.brand_id === brand.id);

  return (
    <StudioShell
      title="Saved drafts"
      email={user.email}
      description="Browse copy you already generated. Opening a row uses the existing editor. Nothing is published from here."
    >
      <DraftLibrary drafts={owned} pillars={ownedPillars} sessionUserId={user.id} error={error} />
    </StudioShell>
  );
}
