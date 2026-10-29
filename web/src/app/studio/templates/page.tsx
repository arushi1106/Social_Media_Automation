import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { TemplateLibrary } from "@/components/template-library";
import { StudioShell } from "@/components/studio-shell";
import { listOwnedTemplates } from "@/app/studio/templates/actions";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { mergeTemplateLibrary } from "@/lib/templates";

export default function TemplatesPage() {
  return (
    <Suspense fallback={<StudioShell title="Loading templates…" />}>
      <TemplatesSession />
    </Suspense>
  );
}

async function TemplatesSession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();
  if (!configured) {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys before saving templates.</p>
      </StudioShell>
    );
  }
  if (!user) {
    redirect("/login?next=/studio/templates");
  }
  if (!brand) {
    redirect("/onboarding");
  }

  const { templates, error } = await listOwnedTemplates();
  const library = mergeTemplateLibrary(templates);

  return (
    <StudioShell
      title="Templates"
      email={user.email}
      description="Reusable writing structures for new drafts. They complement your brand voice and optional pillar. Nothing is published."
    >
      <TemplateLibrary templates={library} loadError={error} />
    </StudioShell>
  );
}
