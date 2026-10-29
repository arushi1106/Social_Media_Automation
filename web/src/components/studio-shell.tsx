import type { ReactNode } from "react";
import { Suspense } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { StudioNav } from "@/components/studio-nav";

export function StudioShell({
  title,
  description,
  email,
  children,
}: {
  title: string;
  description?: string;
  email?: string;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
            Content studio
          </p>
          <h1 className="mt-2 font-serif text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">{description}</p> : null}
          {email ? <p className="mt-2 text-sm text-ink/60">{email}</p> : null}
        </div>
        <SignOutButton />
      </div>
      <Suspense fallback={<nav className="mt-6 min-h-8" aria-label="Studio" />}>
        <StudioNav />
      </Suspense>
      <div className="mt-8">{children}</div>
    </main>
  );
}
