import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ProjectWorkspace } from "@/components/project-workspace";
import { StudioShell } from "@/components/studio-shell";
import { listOwnedDrafts } from "@/app/studio/actions";
import { listOwnedPillars } from "@/app/studio/brand/pillars-actions";
import { listOwnedIdeas } from "@/app/studio/ideas/actions";
import { loadOwnedProject } from "@/app/studio/projects/actions";
import { brandFromRow } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { draftsForProject, ideasForProject } from "@/lib/projects";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<StudioShell title="Loading project…" />}>
      <ProjectDetail params={params} />
    </Suspense>
  );
}

async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys before opening projects.</p>
      </StudioShell>
    );
  }
  if (!user) redirect(`/login?next=/studio/projects/${id}`);
  if (!brand) redirect("/onboarding");

  const [project, { pillars }, { ideas }, { drafts }] = await Promise.all([
    loadOwnedProject(id),
    listOwnedPillars(),
    listOwnedIdeas(),
    listOwnedDrafts(),
  ]);
  if (!project) {
    return (
      <StudioShell title="Project unavailable" email={user.email}>
        <p className="text-sm text-ink/70">
          That project is missing or is not yours. Nothing else was substituted.
        </p>
      </StudioShell>
    );
  }

  return (
    <StudioShell title={project.name} email={user.email} description="Content project workspace. Nothing is published from here.">
      <ProjectWorkspace
        project={project}
        pillars={pillars}
        brandPlatforms={brandFromRow(brand).platforms}
        ideas={ideasForProject(ideas, project.id)}
        drafts={draftsForProject(drafts, project.id)}
      />
    </StudioShell>
  );
}
