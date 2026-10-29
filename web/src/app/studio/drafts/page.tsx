import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StudioShell } from "@/components/studio-shell";
import { listOwnedDrafts } from "@/app/studio/actions";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { formatPlatform, isPlatform } from "@/lib/brand";
import { formatLabel, humanStatus, isContentFormat, isOwnedBy } from "@/lib/content";

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

  const { drafts, error } = await listOwnedDrafts();
  const owned = drafts.filter((row) => isOwnedBy(row, user.id));

  return (
    <StudioShell title="Saved drafts" email={user.email}>
      {error ? (
        <p className="text-sm text-accent" role="alert">
          {error}
        </p>
      ) : null}
      {!error && owned.length === 0 ? (
        <Card className="max-w-xl">
          <p className="text-sm leading-6 text-ink/70">
            No drafts yet. Generate a post from your brand voice, then save it here.
            Nothing is published automatically.
          </p>
          <div className="mt-6">
            <ButtonLink href="/studio/create">Create a draft</ButtonLink>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {owned.map((draft) => {
            const platform = isPlatform(draft.platform) ? formatPlatform(draft.platform) : draft.platform;
            const format = isContentFormat(draft.format) ? formatLabel(draft.format) : draft.format;
            const updated = draft.updated_at
              ? new Date(draft.updated_at).toLocaleString()
              : "";
            return (
              <li key={draft.id}>
                <Link
                  href={`/studio/drafts/${draft.id}`}
                  className="block rounded-2xl border border-ink/10 bg-paper-raised p-5 hover:border-ink/25"
                >
                  <p className="font-serif text-xl">{draft.title || draft.topic || "Untitled"}</p>
                  <p className="mt-1 text-sm text-ink/60">
                    {platform} · {format} · {humanStatus(draft.status)}
                    {updated ? ` · ${updated}` : ""}
                  </p>
                  {draft.topic ? (
                    <p className="mt-2 line-clamp-2 text-sm text-ink/70">{draft.topic}</p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </StudioShell>
  );
}
