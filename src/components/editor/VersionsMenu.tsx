"use client";

import { useState } from "react";
import type { DocumentVersionMeta } from "@/storage/document-persistence";

/**
 * Version history control: save a named snapshot and restore any earlier one.
 * Works in local mode (localStorage) and cloud mode (Supabase) identically.
 */
export function VersionsMenu({
  versions,
  storeLabel,
  onSave,
  onRestore,
}: {
  versions: DocumentVersionMeta[];
  storeLabel: string;
  onSave: (label?: string) => void;
  onRestore: (versionId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="versions-menu">
      <button
        type="button"
        className="versions-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Versioni {versions.length > 0 ? `(${versions.length})` : ""}
      </button>
      {open && (
        <div className="versions-panel">
          <div className="versions-head">
            <button type="button" onClick={() => onSave()}>
              + Salva versione
            </button>
            <span className="versions-store">{storeLabel}</span>
          </div>
          <ul>
            {versions.length === 0 && (
              <li className="versions-empty">Nessuna versione salvata</li>
            )}
            {versions.map((v) => (
              <li key={v.id}>
                <span className="versions-label" title={v.label}>
                  {v.label}
                </span>
                <button type="button" onClick={() => onRestore(v.id)}>
                  Ripristina
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
