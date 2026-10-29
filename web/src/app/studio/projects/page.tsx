import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ProjectList } from "@/components/project-list";
import { StudioShell } from "@/components/studio-shell";
import { listOwnedProjects } from "@/app/studio/projects/actions";
import { listOwnedPillars } from "@/app/studio/brand/pillars-actions";
import { brandFromRow } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";

export default function ProjectsPage() {
  return (
    <Suspense fallback={<StudioShell title="Loading projects…" />}>
      <ProjectsSession />
    </Suspense>
  );
}

async function ProjectsSession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys before saving projects.</p>
      </StudioShell>
    );
  }
  if (!user) redirect("/login?next=/studio/projects");
  if (!brand) redirect("/onboarding");

  const [{ projects, error }, { pillars }] = await Promise.all([listOwnedProjects(), listOwnedPillars()]);
  const draft = brandFromRow(brand);

  return (
    <StudioShell
      title="Projects"
      email={user.email}
      description="Group ideas and drafts around a brief. Planning dates are not a publishing schedule."
    >
      <ProjectList
        projects={projects}
        pillars={pillars}
        brandPlatforms={draft.platforms}
        loadError={error}
      />
    </StudioShell>
  );
}
