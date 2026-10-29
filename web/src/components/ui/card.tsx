import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-ink/10 bg-paper-raised p-6 shadow-[0_1px_0_rgba(31,26,22,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}
