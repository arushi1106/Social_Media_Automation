import { connection } from "next/server";
import { Suspense } from "react";
import { BrandWizard } from "@/components/brand-wizard";
import { SignOutButton } from "@/components/sign-out-button";
import { brandFromRow, emptyBrandDraft } from "@/lib/brand";
import { getCurrentUserAndBrand } from "@/lib/brands-query";

export default function BrandSettingsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-10 text-sm text-ink/60">Loading…</p>}>
      <BrandSettingsSession />
    </Suspense>
  );
}

async function BrandSettingsSession() {
  await connection();
  const { configured, user, brand } = await getCurrentUserAndBrand();

  if (!configured || !user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-serif text-3xl">Sign in required</h1>
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
        initialDraft={brand ? brandFromRow(brand) : emptyBrandDraft()}
      />
    </div>
  );
}
