import type { DocumentPersistence } from "./document-persistence";
import { LocalDocumentStore } from "./local-document-store";
import { getSupabaseBrowserClient } from "./supabase/client";
import { SupabaseDocumentStore } from "./supabase/supabase-document-store";

/**
 * Choose the persistence backend: Supabase (Postgres) for the signed-in user,
 * otherwise localStorage. Called on mount and whenever auth state changes.
 */
export async function createDocumentStore(): Promise<DocumentPersistence> {
  const client = getSupabaseBrowserClient();
  if (client) {
    const { data } = await client.auth.getUser();
    if (data.user) return new SupabaseDocumentStore(client, data.user.id);
  }
  return new LocalDocumentStore();
}
