import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { listOwnedIdeas } from "@/app/studio/ideas/actions";
import { listPlanItemsForWeek } from "@/app/studio/planner/actions";
import { PlannerBoard } from "@/components/planner-board";
import { StudioShell } from "@/components/studio-shell";
import { getCurrentUserAndBrand } from "@/lib/brands-query";
import { ideasPageGate } from "@/lib/ideas";
import { resolveWeekStart } from "@/lib/planner";

export default function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  return (
    <Suspense fallback={<StudioShell title="Loading planner…" />}>
      <PlannerSession searchParams={searchParams} />
    </Suspense>
  );
}

async function PlannerSession({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const { configured, user, brand } = await getCurrentUserAndBrand();
  const gate = ideasPageGate({
    configured,
    hasUser: Boolean(user),
    hasBrand: Boolean(brand),
  });
  if (gate === "config") {
    return (
      <StudioShell title="Configuration needed">
        <p className="text-sm text-ink/70">Add Supabase keys to plan a writing week.</p>
      </StudioShell>
    );
  }
  if (gate === "login") {
    redirect("/login?next=/studio/planner");
  }
  if (gate === "onboarding" || !user) {
    redirect("/onboarding");
  }

  const weekStart = resolveWeekStart(params.week);
  const [{ ideas, error: ideasError }, { items, error: planError }] = await Promise.all([
    listOwnedIdeas(),
    listPlanItemsForWeek(weekStart),
  ]);
  const error = ideasError || planError;

  return (
    <StudioShell
      title="Content Planner"
      email={user.email}
      description="Plan which saved ideas you will write this week. This is a writing board, not a posting calendar."
    >
      {error ? (
        <p className="mb-4 text-sm text-accent" role="alert">
          {error}
        </p>
      ) : null}
      <PlannerBoard weekStart={weekStart} ideas={ideas} items={items} />
    </StudioShell>
  );
}
