import { connection } from "next/server";
import { Suspense } from "react";
import { BrandWizard } from "@/components/brand-wizard";
import { ContentPillarsManager } from "@/components/content-pillars";
import { StudioShell } from "@/components/studio-shell";
import { listOwnedPillars } from "@/app/studio/brand/pillars-actions";
import { brandFromRow, emptyBrandDraft } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";

export default function BrandSettingsPage() {
  return (
    <Suspense fallback={<StudioShell title="Loading brand…" />}>
      <BrandSettingsSession />
    </Suspense>
  );
}

async function BrandSettingsSession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();

  if (!configured) {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys before editing your brand.</p>
      </StudioShell>
    );
  }

  if (!user) {
    return (
      <StudioShell title="Sign in required">
        <p className="text-sm text-ink/70">Sign in to edit brand preferences and content pillars.</p>
      </StudioShell>
    );
  }

  const { pillars, error } = brand ? await listOwnedPillars() : { pillars: [], error: null };

  return (
    <StudioShell
      title="Brand"
      email={user.email}
      description="Voice, platforms, and recurring content pillars. Changing these does not publish posts."
    >
      <div className="space-y-8">
        <BrandWizard
          mode={brand ? "edit" : "onboarding"}
          initialDraft={brand ? brandFromRow(brand) : emptyBrandDraft()}
        />
        {brand ? (
          <>
            {error ? (
              <p className="text-sm text-accent" role="alert">
                {error}
              </p>
            ) : null}
            <ContentPillarsManager pillars={pillars} />
          </>
        ) : (
          <p className="text-sm text-ink/70">Save your brand profile first, then add content pillars here.</p>
        )}
      </div>
    </StudioShell>
  );
}
