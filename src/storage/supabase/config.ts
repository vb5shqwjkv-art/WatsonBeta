/**
 * Supabase configuration detection. When the public env vars are absent the app
 * runs in "local mode" (localStorage, no auth); when present, cloud mode with
 * Supabase Auth and Postgres persistence is available.
 */
export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
