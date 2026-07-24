import "server-only";

/**
 * Server-only environment access. Importing this module from a client bundle is
 * a build error (via `server-only`), which prevents leaking secrets.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const serverEnv = {
  openai: {
    apiKey: () => required("OPENAI_API_KEY"),
    reasoningModel: () => optional("OPENAI_REASONING_MODEL", "gpt-4o"),
    realtimeModel: () =>
      optional("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview"),
  },
  supabase: {
    url: () => required("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  },
} as const;
