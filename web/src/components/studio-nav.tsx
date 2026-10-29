"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isStudioNavCurrent, STUDIO_NAV_LINKS } from "@/lib/studio-nav";

export function StudioNav() {
  const pathname = usePathname() || "/studio";

  return (
    <nav className="mt-6 flex flex-wrap gap-2" aria-label="Studio">
      {STUDIO_NAV_LINKS.map((link) => {
        const current = isStudioNavCurrent(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              current
                ? "border-accent/40 bg-accent/10 text-ink"
                : "border-ink/15 text-ink/80 hover:bg-ink/5"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
