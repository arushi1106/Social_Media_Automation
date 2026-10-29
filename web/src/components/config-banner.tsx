import { supabasePublicConfig } from "@/lib/env";

export function ConfigBanner() {
  if (supabasePublicConfig().configured) {
    return null;
  }

  return (
    <div className="border-b border-accent/20 bg-accent/10 px-4 py-3 text-sm text-ink">
      <p className="mx-auto max-w-5xl">
        Supabase public keys are not set. Copy <code className="font-mono text-xs">.env.example</code>{" "}
        to <code className="font-mono text-xs">web/.env.local</code>. Sign-in will fail until
        those values come from a real project.
      </p>
    </div>
  );
}
