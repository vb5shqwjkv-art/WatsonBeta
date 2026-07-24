"use client";

import type { SttState } from "@/speech/types";

/**
 * The single control of the application: a large, obvious microphone button.
 * When on, dictation is live and the page changes as the user speaks. When off,
 * nothing happens. No menus, no toolbars — the page and this button are the
 * whole interface.
 */

export interface MicButtonProps {
  on: boolean;
  supported: boolean;
  processing: boolean;
  state: SttState;
  interim: string;
  saved: boolean;
  onToggle: () => void;
}

function MicIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Z"
        fill="currentColor"
      />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function MicButton({
  on,
  supported,
  processing,
  state,
  interim,
  saved,
  onToggle,
}: MicButtonProps) {
  const label = !supported
    ? "Dettatura non supportata in questo browser"
    : on
      ? "Ferma la dettatura"
      : "Avvia la dettatura";

  const status = !supported
    ? "Browser non supportato"
    : processing
      ? "Sto scrivendo…"
      : on
        ? interim || "Ti ascolto…"
        : saved
          ? "Salvato ✓"
          : "Tocca per parlare";

  return (
    <div className="mic-dock">
      <div className="mic-status" data-active={on || processing || saved}>
        {status}
      </div>
      <button
        type="button"
        className="mic-button"
        data-on={on}
        data-processing={processing}
        data-error={state === "error"}
        aria-pressed={on}
        aria-label={label}
        title={label}
        disabled={!supported}
        onClick={onToggle}
      >
        {processing && <span className="mic-spinner" aria-hidden="true" />}
        <MicIcon />
      </button>
    </div>
  );
}
