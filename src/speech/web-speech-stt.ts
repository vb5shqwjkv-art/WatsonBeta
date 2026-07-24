import type {
  SttCallbacks,
  SttProvider,
  SttSession,
  SttSessionOptions,
} from "./types";

/**
 * Web Speech API implementation of the {@link SttProvider} port.
 *
 * Uses the browser's built-in continuous recognition — no server audio
 * pipeline required — so the dictation loop works end-to-end immediately.
 * Because browsers stop recognition on silence, the session auto-restarts
 * while the user keeps the mic on.
 */

/* Minimal typings for the (prefixed, partially-standard) Web Speech API. */
interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  readonly [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
  readonly message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Errors that must stop the session rather than trigger an auto-restart. */
const FATAL_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "language-not-supported",
]);

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

class WebSpeechSession implements SttSession {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;

  constructor(
    private readonly ctor: SpeechRecognitionCtor,
    private readonly options: SttSessionOptions,
    private readonly callbacks: SttCallbacks,
  ) {}

  start(): void {
    if (this.active) return;
    this.active = true;

    const recognition = new this.ctor();
    recognition.lang = this.options.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => this.callbacks.onStateChange?.("listening");

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results.item(i);
        const transcript = result.item(0).transcript;
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText.length > 0) this.callbacks.onFinal(finalText);
        } else {
          interim += transcript;
        }
      }
      if (interim.trim().length > 0) this.callbacks.onInterim?.(interim.trim());
    };

    recognition.onerror = (event) => {
      // "no-speech"/"aborted" are benign; keep the session alive.
      if (event.error === "no-speech" || event.error === "aborted") return;
      // Fatal errors (permission denied, no mic, unsupported language) must NOT
      // auto-restart — otherwise onend would loop forever. Tear the session down.
      if (FATAL_ERRORS.has(event.error)) {
        this.active = false;
      }
      this.callbacks.onError?.(event.message || event.error);
      this.callbacks.onStateChange?.("error");
    };

    recognition.onend = () => {
      // Browsers end on silence; restart while the user keeps the mic on.
      if (this.active) {
        try {
          recognition.start();
        } catch {
          /* start() throws if called too quickly; ignore and let onend retry */
        }
      } else {
        this.callbacks.onStateChange?.("idle");
      }
    };

    this.recognition = recognition;
    recognition.start();
  }

  stop(): void {
    this.active = false;
    this.recognition?.stop();
    this.recognition = null;
  }
}

export class WebSpeechSttProvider implements SttProvider {
  readonly name = "web-speech";

  get isSupported(): boolean {
    return getRecognitionCtor() !== null;
  }

  createSession(
    options: SttSessionOptions,
    callbacks: SttCallbacks,
  ): SttSession {
    const ctor = getRecognitionCtor();
    if (!ctor) {
      throw new Error("Web Speech API is not supported in this browser.");
    }
    return new WebSpeechSession(ctor, options, callbacks);
  }
}
