"use client";

import { useState } from "react";
import type { AuthResult, AuthUser } from "@/auth/auth";

/**
 * Inline sign-in bar (top-left). Shown only when Supabase is configured; in
 * local mode it renders nothing and the app works without an account.
 */
export function AuthBar({
  configured,
  user,
  onSignIn,
  onSignUp,
  onSignOut,
}: {
  configured: boolean;
  user: AuthUser | null;
  onSignIn: (email: string, password: string) => Promise<AuthResult>;
  onSignUp: (email: string, password: string) => Promise<AuthResult>;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!configured) return null;

  if (user) {
    return (
      <div className="auth-bar">
        <span className="auth-email" title={user.email ?? ""}>
          {user.email}
        </span>
        <button type="button" onClick={onSignOut}>
          Esci
        </button>
      </div>
    );
  }

  const submit = async (action: typeof onSignIn) => {
    setBusy(true);
    setError(null);
    const result = await action(email, password);
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Errore.");
  };

  return (
    <div className="auth-bar">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}>
          Accedi
        </button>
      ) : (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(onSignIn);
          }}
        >
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="submit" disabled={busy}>
            Accedi
          </button>
          <button type="button" disabled={busy} onClick={() => void submit(onSignUp)}>
            Registrati
          </button>
          {error && <span className="auth-err">{error}</span>}
        </form>
      )}
    </div>
  );
}
