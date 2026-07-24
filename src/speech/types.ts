/**
 * ─────────────────────────────────────────────────────────────────────────
 * Speech-to-Text provider port
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The dictation loop depends on this interface, not on a concrete engine. The
 * Web Speech API implementation ships first (zero-setup, low latency); OpenAI
 * Realtime / Whisper are drop-in alternatives behind the same port.
 */

export type SttState = "idle" | "listening" | "error";

export interface SttCallbacks {
  /** Partial hypothesis while the user is still speaking. */
  onInterim?(text: string): void;
  /** A finalized, endpointed utterance ready to be acted on. */
  onFinal(text: string): void;
  onStateChange?(state: SttState): void;
  onError?(message: string): void;
}

export interface SttSessionOptions {
  /** BCP-47 language tag, e.g. "it-IT". */
  lang: string;
}

export interface SttSession {
  start(): void;
  stop(): void;
}

export interface SttProvider {
  readonly name: string;
  readonly isSupported: boolean;
  createSession(options: SttSessionOptions, callbacks: SttCallbacks): SttSession;
}
