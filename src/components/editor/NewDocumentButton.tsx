"use client";

import { useEffect, useState } from "react";

/**
 * "Nuovo" — erase everything and start from a blank page. Two-click confirm so
 * the current (already-downloaded) document can't be wiped by accident.
 */
export function NewDocumentButton({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <button
      type="button"
      className="new-doc-button"
      data-confirming={confirming}
      onClick={() => {
        if (confirming) {
          onClear();
          setConfirming(false);
        } else {
          setConfirming(true);
        }
      }}
    >
      {confirming ? "Cancellare tutto?" : "Nuovo"}
    </button>
  );
}
