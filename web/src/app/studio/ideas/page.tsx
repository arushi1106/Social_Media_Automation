import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { IdeaBank } from "@/components/idea-bank";
import { StudioShell } from "@/components/studio-shell";
import { listOwnedIdeas } from "@/app/studio/ideas/actions";
import { brandFromRow } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { ideasPageGate } from "@/lib/ideas";

export default function IdeasPage() {
  return (
    <Suspense fallback={<StudioShell title="Loading ideas…" />}>
      <IdeasSession />
    </Suspense>
  );
}

async function IdeasSession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();
  const gate = ideasPageGate({
    configured,
    hasUser: Boolean(user),
    hasBrand: Boolean(brand),
  });
  if (gate === "config") {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys to generate and save ideas.</p>
      </StudioShell>
    );
  }
  if (gate === "login") {
    redirect("/login?next=/studio/ideas");
  }
  if (gate === "onboarding" || !brand || !user) {
    redirect("/onboarding");
  }

  const { ideas, error } = await listOwnedIdeas();

  return (
    <StudioShell title="Topic ideas" email={user.email}>
      {error ? (
        <p className="mb-4 text-sm text-accent" role="alert">
          {error}
        </p>
      ) : null}
      <IdeaBank brand={brandFromRow(brand)} saved={ideas} />
    </StudioShell>
  );
}
