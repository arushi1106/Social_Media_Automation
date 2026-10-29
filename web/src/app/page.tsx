import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Suspense } from "react";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<SiteHeader signedIn={false} />}>
        <HeaderWithSession />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
          Phase 1 foundation
        </p>
        <h1 className="mt-4 max-w-2xl font-serif text-5xl leading-tight text-ink">
          A studio for drafts, not a publisher.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-ink/75">
          Generate LinkedIn, Instagram, X, and blog copy from a source URL, keep
          brand voice in your account, and save drafts. Automatic posting is
          intentionally left out.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/signup">Start with an account</ButtonLink>
          <ButtonLink href="/studio" variant="ghost">
            Open the studio
          </ButtonLink>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          <Card>
            <h2 className="font-serif text-xl">Platform drafts</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Reuses the existing extraction and OpenAI writing path, without
              LinkedIn or Instagram publish calls.
            </p>
          </Card>
          <Card>
            <h2 className="font-serif text-xl">Owned data</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Profiles, brands, sources, and content items live in Postgres with
              row-level security.
            </p>
          </Card>
          <Card>
            <h2 className="font-serif text-xl">Keys stay server-side</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              The browser never receives OpenAI or database credentials. The
              Python API verifies a Supabase user JWT.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}

async function HeaderWithSession() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return <SiteHeader signedIn={false} />;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <SiteHeader signedIn={Boolean(user)} />;
}
