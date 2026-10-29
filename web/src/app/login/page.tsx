import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Card } from "@/components/ui/card";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense fallback={<LoginFrame nextPath="/studio" />}>
      <LoginWithNext searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginWithNext({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/studio";
  return <LoginFrame nextPath={nextPath} />;
}

function LoginFrame({ nextPath }: { nextPath: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <p className="font-serif text-3xl">Sign in</p>
      <p className="mt-2 text-sm text-ink/70">
        Uses Supabase Auth. Brand preferences load after you sign in.
      </p>
      <Card className="mt-8">
        <AuthForm mode="login" nextPath={nextPath} />
      </Card>
      <p className="mt-4 text-sm text-ink/60">
        No account yet?{" "}
        <Link href="/signup" className="text-accent underline-offset-2 hover:underline">
          Create one
        </Link>
      </p>
    </main>
  );
}
