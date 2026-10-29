import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { listOwnedDrafts } from "@/app/studio/actions";
import { listOwnedPillars } from "@/app/studio/brand/pillars-actions";
import { StrategyOverview } from "@/components/strategy-overview";
import { StudioShell } from "@/components/studio-shell";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { isOwnedBy } from "@/lib/content";
import { isOwnedPillar } from "@/lib/pillars";
import { buildStrategyReport } from "@/lib/strategy";

export default function StrategyPage() {
  return (
    <Suspense fallback={<StudioShell title="Loading strategy…" />}>
      <StrategySession />
    </Suspense>
  );
}

async function StrategySession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys before viewing strategy.</p>
      </StudioShell>
    );
  }
  if (!user) {
    redirect("/login?next=/studio/strategy");
  }
  if (!brand) {
    redirect("/onboarding");
  }

  const [pillarsResult, draftsResult] = await Promise.all([listOwnedPillars(), listOwnedDrafts()]);
  const pillars = pillarsResult.pillars.filter(
    (row) => isOwnedPillar(row, user.id) && row.brand_id === brand.id,
  );
  const drafts = draftsResult.drafts.filter((row) => isOwnedBy(row, user.id));
  const report = buildStrategyReport({
    pillars,
    drafts,
    sessionUserId: user.id,
    brandId: brand.id,
  });
  const errors = [pillarsResult.error, draftsResult.error].filter((item): item is string => Boolean(item));

  return (
    <StudioShell
      title="Content strategy"
      email={user.email}
      description="A read-only view of how your saved drafts sit across content pillars. Nothing is published or scheduled from here."
    >
      <StrategyOverview report={report} errors={errors} />
    </StudioShell>
  );
}
