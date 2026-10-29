"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicConfig } from "@/lib/env";

export function createBrowserSupabaseClient() {
  const { url, anonKey, configured } = supabasePublicConfig();
  if (!configured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return createBrowserClient(url, anonKey);
}
