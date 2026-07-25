"use client";

import type { SttState } from "@/speech/types";

/**
 * The controls dock: a small red "manual edit" toggle beside the large mic
 * button. The document is not hand-editable until manual edit is turned on.
 */

export interface MicButtonProps {
  on: boolean;
  supported: boolean;
  processing: boolean;
  state: SttState;
  interim: string;
  saved: boolean;
  onToggle: () => void;
  manualEdit: boolean;
  onToggleManualEdit: () => void;
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

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M13.5 6.5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
  manualEdit,
  onToggleManualEdit,
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
        : manualEdit
          ? "Modifica manuale attiva"
          : saved
            ? "Salvato ✓"
            : "Tocca per parlare";

  return (
    <div className="mic-dock">
      <div className="mic-status" data-active={on || processing || saved || manualEdit}>
        {status}
      </div>
      <div className="mic-row">
        <button
          type="button"
          className="edit-button"
          data-active={manualEdit}
          aria-pressed={manualEdit}
          aria-label="Modifica manuale del testo"
          title={manualEdit ? "Disattiva modifica manuale" : "Attiva modifica manuale"}
          onClick={onToggleManualEdit}
        >
          <PencilIcon />
        </button>
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
    </div>
  );
}
