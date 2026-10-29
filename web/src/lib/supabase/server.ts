import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabasePublicConfig } from "@/lib/env";

export async function createServerSupabaseClient() {
  const { url, anonKey, configured } = supabasePublicConfig();
  if (!configured) {
    return null;
  }

  await connection();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component; proxy.ts refreshes sessions.
        }
      },
    },
  });
}
