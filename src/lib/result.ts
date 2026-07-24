/**
 * A lightweight `Result` type for operations that can fail in expected ways.
 *
 * The Editor Controller and operation validators use this instead of throwing,
 * so that a malformed LLM tool call degrades into a handled error (surfaced to
 * the user and logged) rather than crashing a turn or corrupting the document.
 */
export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Categorizes a failure so callers (and telemetry) can branch on it. */
export type AppErrorCode =
  | "validation" // tool-call arguments failed schema validation
  | "reference" // a target/blockId could not be resolved in the document
  | "unsupported" // the requested operation is not applicable to the target
  | "conflict" // the document changed under an optimistic-concurrency assumption
  | "provider" // an upstream provider (LLM / STT) errored
  | "internal"; // an unexpected, non-recoverable failure

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string;
  /** Optional machine-readable detail for logging or repair attempts. */
  readonly detail?: unknown;
}

export function appError(
  code: AppErrorCode,
  message: string,
  detail?: unknown,
): AppError {
  return { code, message, detail };
}
