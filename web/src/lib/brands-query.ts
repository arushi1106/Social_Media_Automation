import type { BrandRow } from "@/lib/brand";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCurrentUserAndBrand() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { configured: false as const, user: null, brand: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { configured: true as const, user: null, brand: null };
  }

  const { data: brand } = await supabase
    .from("brands")
    .select(
      "id, user_id, name, niche, bio, audience, language, platforms, goals, topics, voice_preferences",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    configured: true as const,
    user,
    brand: (brand as BrandRow | null) ?? null,
  };
}
