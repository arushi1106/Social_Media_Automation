export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey),
  };
}

export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL?.trim() || "http://127.0.0.1:8000";
}
