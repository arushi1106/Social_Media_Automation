import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CreateDraftForm } from "@/components/create-draft-form";
import { StudioShell } from "@/components/studio-shell";
import { loadOwnedIdea } from "@/app/studio/ideas/actions";
import { loadOwnedPlanItem } from "@/app/studio/planner/actions";
import { brandFromRow } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { ideaToCreateForm } from "@/lib/ideas";

export default function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string; plan?: string }>;
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
  searchParams: Promise<{ idea?: string; plan?: string }>;
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
  const initialForm = idea ? ideaToCreateForm(idea, draft.platforms) : undefined;

  return (
    <StudioShell title="Create a draft" email={user.email}>
      <CreateDraftForm
        brand={draft}
        initialForm={initialForm}
        ideaId={idea?.id}
        planItemId={linkedPlanId}
      />
    </StudioShell>
  );
}
