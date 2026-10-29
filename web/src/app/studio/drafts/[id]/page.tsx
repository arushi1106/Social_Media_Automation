import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { DraftEditor } from "@/components/draft-editor";
import { StudioShell } from "@/components/studio-shell";
import { loadOwnedDraft } from "@/app/studio/actions";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import {
  contentFromRow,
  emptyCreateForm,
  hydrateCreateForm,
  isOwnedBy,
  type CreateFormState,
} from "@/lib/content";
import { isPlatform } from "@/lib/brand";

export default function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<StudioShell title="Loading draft…" />}>
      <DraftDetail params={params} />
    </Suspense>
  );
}

async function DraftDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys to open drafts.</p>
      </StudioShell>
    );
  }
  if (!user) {
    redirect(`/login?next=/studio/drafts/${id}`);
  }
  if (!brand) {
    redirect("/onboarding");
  }

  const row = await loadOwnedDraft(id);
  if (!row || !isOwnedBy(row, user.id)) {
    notFound();
  }
  const content = contentFromRow(row);
  if (!content) {
    notFound();
  }
  const storedInputs = (row.metadata?.inputs ?? null) as Partial<CreateFormState> | null;
  const fallback = emptyCreateForm(isPlatform(row.platform) ? [row.platform] : ["linkedin"]);
  const inputs =
    storedInputs && isPlatform(storedInputs.platform ?? "")
      ? hydrateCreateForm(storedInputs, fallback)
      : fallback;

  return (
    <StudioShell title={row.title || row.topic || "Draft"} email={user.email}>
      <DraftEditor draftId={row.id} initial={content} inputs={inputs} />
    </StudioShell>
  );
}
