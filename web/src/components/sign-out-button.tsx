"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { supabasePublicConfig } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    if (!supabasePublicConfig().configured) {
      router.push("/");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={signOut}>
      Sign out
    </Button>
  );
}
