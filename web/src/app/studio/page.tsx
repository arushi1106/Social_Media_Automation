import { Suspense } from "react";
import { connection } from "next/server";
import { ContinueDraftLink } from "@/components/continue-draft-link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StudioShell } from "@/components/studio-shell";
import { apiBaseUrl } from "@/lib/env";
import {
  brandFromRow,
  formatGoal,
  formatPlatform,
  formatTone,
  parseTopics,
} from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";

export default function StudioPage() {
  return (
    <Suspense fallback={<StudioShell title="Loading session…" />}>
      <StudioSession />
    </Suspense>
  );
}

async function StudioSession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();

  if (!configured) {
    return (
      <StudioShell title="Studio is waiting on configuration">
        <p className="text-sm leading-6 text-ink/70">
          Set Supabase keys in <code className="font-mono text-xs">web/.env.local</code>{" "}
          and apply the SQL migrations before accounts or brands can persist.
        </p>
      </StudioShell>
    );
  }

  if (!user) {
    return (
      <StudioShell title="Sign in required">
        <p className="text-sm leading-6 text-ink/70">
          The session proxy sends unauthenticated visitors to login when Supabase
          is configured.
        </p>
      </StudioShell>
    );
  }

  if (!brand) {
    return (
      <StudioShell title="Set up your brand first" email={user.email}>
        <Card className="max-w-xl">
          <p className="text-sm leading-6 text-ink/70">
            Save your name, audience, tone, and platforms so later drafts can follow
            your voice. You can edit this anytime.
          </p>
          <div className="mt-6">
            <ButtonLink href="/onboarding">Set up my brand</ButtonLink>
          </div>
        </Card>
      </StudioShell>
    );
  }

  const draft = brandFromRow(brand);
  const topics = parseTopics(draft.topicsText);

  return (
    <StudioShell title={brand.name} email={user.email}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-serif text-xl">Brand preferences</h2>
          <dl className="mt-4 space-y-2 text-sm text-ink/80">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Niche</dt>
              <dd>{draft.niche || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Audience</dt>
              <dd>{draft.audience || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Tone</dt>
              <dd>{formatTone(draft.tone, draft.customTone)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Platforms</dt>
              <dd>{draft.platforms.map(formatPlatform).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Goals</dt>
              <dd>{draft.goals.map(formatGoal).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Topics</dt>
              <dd>{topics.join(", ") || "—"}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink href="/studio/brand" variant="ghost">
              Edit brand
            </ButtonLink>
            <ButtonLink href="/studio/brand#content-pillars" variant="ghost">
              Content pillars
            </ButtonLink>
          </div>
        </Card>
        <Card>
          <h2 className="font-serif text-xl">Create a draft</h2>
          <p className="mt-3 text-sm leading-6 text-ink/70">
            Generate LinkedIn or Instagram copy from your saved voice. The Python API
            at <code className="font-mono text-xs">{apiBaseUrl()}</code> calls OpenAI
            on the server. Drafts stay in your account. Nothing is published.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink href="/studio/ideas">Discover ideas</ButtonLink>
            <ButtonLink href="/studio/planner" variant="ghost">
              Weekly planner
            </ButtonLink>
            <ButtonLink href="/studio/strategy" variant="ghost">
              Content strategy
            </ButtonLink>
            <ButtonLink href="/studio/create" variant="ghost">
              New draft
            </ButtonLink>
            <ContinueDraftLink />
            <ButtonLink href="/studio/drafts" variant="ghost">
              Saved drafts
            </ButtonLink>
          </div>
        </Card>
      </div>
    </StudioShell>
  );
}
