import type { ReactNode } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

const links = [
  { href: "/studio", label: "Overview" },
  { href: "/studio/ideas", label: "Ideas" },
  { href: "/studio/planner", label: "Planner" },
  { href: "/studio/create", label: "New draft" },
  { href: "/studio/drafts", label: "Drafts" },
  { href: "/studio/brand", label: "Brand" },
];

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
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Studio">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-ink/5"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="mt-8">{children}</div>
    </main>
  );
}
