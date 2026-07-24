"use client";

import type { ExportFormat } from "@/export/exporter";

/**
 * A minimal export control in the top corner. The document can also be exported
 * by voice ("esporta in PDF"); this is the visible affordance for the same.
 */
export function ExportMenu({
  onExport,
  busy,
}: {
  onExport: (format: ExportFormat) => void;
  busy: boolean;
}) {
  return (
    <div className="export-menu" aria-label="Esporta documento">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <button type="button" onClick={() => onExport("pdf")} disabled={busy}>
        PDF
      </button>
      <span className="export-sep" aria-hidden="true" />
      <button type="button" onClick={() => onExport("docx")} disabled={busy}>
        Word
      </button>
    </div>
  );
}
