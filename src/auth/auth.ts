import { getSupabaseBrowserClient } from "@/storage/supabase/client";

/**
 * Thin auth helpers over Supabase Auth (email + password). All no-op / null in
 * local mode (Supabase not configured), so the app runs without an account.
 */
export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
}

export interface AuthResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: "Supabase non configurato." };
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: "Supabase non configurato." };
  const { error } = await client.auth.signUp({ email, password });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (client) await client.auth.signOut();
}

/** Subscribe to sign-in/out; returns an unsubscribe function. */
export function onAuthStateChange(
  callback: (user: AuthUser | null) => void,
): () => void {
  const client = getSupabaseBrowserClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(
      session?.user
        ? { id: session.user.id, email: session.user.email ?? null }
        : null,
    );
  });
  return () => data.subscription.unsubscribe();
}
