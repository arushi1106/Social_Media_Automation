import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ProductionOverview } from "@/components/production-overview";
import { StudioShell } from "@/components/studio-shell";
import { listOwnedDrafts } from "@/app/studio/actions";
import { listOwnedPillars } from "@/app/studio/brand/pillars-actions";
import { listOwnedIdeas } from "@/app/studio/ideas/actions";
import { listOwnedProjects } from "@/app/studio/projects/actions";
import { getCurrentUserAndBrand } from "@/lib/brands-query";

export default function WorkPage() {
  return (
    <Suspense fallback={<StudioShell title="Loading work…" />}>
      <WorkSession />
    </Suspense>
  );
}

async function WorkSession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys before viewing production progress.</p>
      </StudioShell>
    );
  }
  if (!user) redirect("/login?next=/studio/work");
  if (!brand) redirect("/onboarding");

  const [draftsResult, ideasResult, pillarsResult, projectsResult] = await Promise.all([
    listOwnedDrafts(),
    listOwnedIdeas(),
    listOwnedPillars(),
    listOwnedProjects(),
  ]);
  const loadError = draftsResult.error || ideasResult.error || pillarsResult.error || projectsResult.error;

  return (
    <StudioShell
      title="Work"
      email={user.email}
      description="Progress from saved ideas to drafts marked ready for use. Not a publishing queue."
    >
      <ProductionOverview
        drafts={draftsResult.drafts}
        ideas={ideasResult.ideas}
        pillars={pillarsResult.pillars}
        projects={projectsResult.projects}
        loadError={loadError}
      />
    </StudioShell>
  );
}
