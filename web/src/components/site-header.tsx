import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export function SiteHeader({
  signedIn,
}: {
  signedIn: boolean;
}) {
  return (
    <header className="border-b border-ink/10 bg-paper/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-serif text-xl tracking-tight text-ink">
          Atelier
        </Link>
        <nav className="flex items-center gap-2">
          {signedIn ? (
            <>
              <ButtonLink href="/onboarding" variant="ghost">
                Brand
              </ButtonLink>
              <ButtonLink href="/studio" variant="secondary">
                Studio
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup">Create account</ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
