import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

/**
 * Lazily-created singleton browser Supabase client. Returns null in local mode
 * (Supabase not configured), so callers can fall back to localStorage.
 */
let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client;
  const config = getSupabaseConfig();
  if (!config) return null;
  client = createBrowserClient(config.url, config.anonKey);
  return client;
}
