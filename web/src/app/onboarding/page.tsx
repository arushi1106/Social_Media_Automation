import { connection } from "next/server";
import { BrandWizard } from "@/components/brand-wizard";
import { brandFromRow } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { SignOutButton } from "@/components/sign-out-button";
import { Suspense } from "react";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<p className="px-4 py-10 text-sm text-ink/60">Loading…</p>}>
      <OnboardingSession />
    </Suspense>
  );
}

async function OnboardingSession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();

  if (!configured) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-serif text-3xl">Supabase is not configured</h1>
        <p className="mt-3 text-sm text-ink/70">
          Add public keys to web/.env.local before onboarding can save.
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-serif text-3xl">Sign in required</h1>
        <p className="mt-3 text-sm text-ink/70">
          Brand preferences are stored on your account.
        </p>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl justify-end px-4 pt-6">
        <SignOutButton />
      </div>
      <BrandWizard
        mode={brand ? "edit" : "onboarding"}
        initialDraft={brand ? brandFromRow(brand) : null}
      />
    </div>
  );
}
