import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CreateDraftForm } from "@/components/create-draft-form";
import { StudioShell } from "@/components/studio-shell";
import { loadOwnedIdea } from "@/app/studio/ideas/actions";
import { loadOwnedPlanItem } from "@/app/studio/planner/actions";
import { brandFromRow } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { listOwnedPillars, loadOwnedPillar } from "@/app/studio/brand/pillars-actions";
import { loadOwnedTemplate } from "@/app/studio/templates/actions";
import { emptyCreateForm } from "@/lib/content";
import { ideaToCreateForm } from "@/lib/ideas";
import { applyTemplateToForm, getSystemTemplate } from "@/lib/templates";
import { loadOwnedProject } from "@/app/studio/projects/actions";
import { createFormForProject } from "@/lib/projects";

type CreateSearch = {
  idea?: string;
  plan?: string;
  pillar?: string;
  template?: string;
  system?: string;
  project?: string;
};

export default function CreatePage({
  searchParams,
}: {
  searchParams: Promise<CreateSearch>;
}) {
  return (
    <Suspense fallback={<StudioShell title="Loading…" />}>
      <CreateSession searchParams={searchParams} />
    </Suspense>
  );
}

async function CreateSession({
  searchParams,
}: {
  searchParams: Promise<CreateSearch>;
}) {
  await connection();
  const params = await searchParams;
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys before creating drafts.</p>
      </StudioShell>
    );
  }
  if (!user) {
    redirect("/login?next=/studio/create");
  }
  if (!brand) {
    redirect("/onboarding");
  }
  const draft = brandFromRow(brand);
  const idea = params.idea ? await loadOwnedIdea(params.idea) : null;
  const planItem = params.plan ? await loadOwnedPlanItem(params.plan) : null;
  const linkedPlanId =
    idea && planItem && planItem.idea_id === idea.id ? planItem.id : undefined;
  const requestedPillar = params.pillar ? await loadOwnedPillar(params.pillar) : null;
  const systemTemplate = params.system ? getSystemTemplate(params.system) : null;
  const userTemplate = params.template ? await loadOwnedTemplate(params.template) : null;
  const appliedTemplate = userTemplate ?? systemTemplate;
  const project = params.project ? await loadOwnedProject(params.project) : null;
  const pillarFields = requestedPillar
    ? {
        pillarId: requestedPillar.id,
        pillarName: requestedPillar.name,
        pillarDescription: requestedPillar.description,
      }
    : { pillarId: "", pillarName: "", pillarDescription: "" };
  const ideaForm = idea ? ideaToCreateForm(idea, draft.platforms) : undefined;
  const templateForm = appliedTemplate
    ? applyTemplateToForm(
        emptyCreateForm(draft.platforms, draft.preferredPlatform),
        appliedTemplate,
        draft.platforms,
      )
    : undefined;
  const projectForm = project
    ? createFormForProject(
        emptyCreateForm(draft.platforms, draft.preferredPlatform),
        project,
        draft.platforms,
      )
    : undefined;
  const initialForm = ideaForm
    ? {
        ...ideaForm,
        ...pillarFields,
        extraInstructions: [templateForm?.extraInstructions, projectForm?.extraInstructions, ideaForm.extraInstructions]
          .filter(Boolean)
          .join("\n\n"),
        format: ideaForm.format,
        platform: ideaForm.platform,
        projectId: project?.id ?? "",
        ...(requestedPillar ? pillarFields : {}),
      }
    : requestedPillar || appliedTemplate || project
      ? {
          ...(projectForm ?? templateForm ?? emptyCreateForm(draft.platforms, draft.preferredPlatform)),
          extraInstructions: [templateForm?.extraInstructions, projectForm?.extraInstructions]
            .filter(Boolean)
            .join("\n\n"),
          projectId: projectForm?.projectId ?? "",
          ...(requestedPillar ? pillarFields : {}),
        }
      : undefined;
  const { pillars } = await listOwnedPillars();
  const pillarUnavailable = Boolean(params.pillar && !requestedPillar);
  const templateUnavailable = Boolean((params.template || params.system) && !appliedTemplate);

  return (
    <StudioShell title="Create a draft" email={user.email}>
      <CreateDraftForm
        brand={draft}
        pillars={pillars}
        initialForm={initialForm}
        pillarUnavailable={pillarUnavailable}
        templateName={appliedTemplate?.name}
        templateUnavailable={templateUnavailable}
        ideaId={idea?.id}
        planItemId={linkedPlanId}
      />
    </StudioShell>
  );
}
