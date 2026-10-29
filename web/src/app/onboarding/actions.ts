"use server";

import { revalidatePath } from "next/cache";
import {
  hasErrors,
  saveErrorMessage,
  toBrandWritePayload,
  validateBrandDraft,
  type BrandDraft,
} from "@/lib/brand";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SaveBrandResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: ReturnType<typeof validateBrandDraft> };

export async function saveBrand(draft: BrandDraft): Promise<SaveBrandResult> {
  const fieldErrors = validateBrandDraft(draft);
  if (hasErrors(fieldErrors)) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Supabase is not configured on the server. Check web/.env.local.",
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, message: "Your session expired. Sign in again to save." };
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: user.id },
    { onConflict: "id" },
  );
  if (profileError) {
    return { ok: false, message: saveErrorMessage(profileError) };
  }

  const payload = toBrandWritePayload(draft, user.id);
  const { error } = await supabase.from("brands").upsert(payload, { onConflict: "user_id" });
  if (error) {
    return { ok: false, message: saveErrorMessage(error) };
  }

  revalidatePath("/studio");
  revalidatePath("/onboarding");
  revalidatePath("/studio/brand");
  return { ok: true };
}
