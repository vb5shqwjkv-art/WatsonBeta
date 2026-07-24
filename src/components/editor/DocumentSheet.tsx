"use client";

import { useEffect, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";

/**
 * The document surface — a real A4 page, paginated. It is the only thing the
 * user reads. Not user-editable (dictation drives all changes). Content flows
 * continuously; page-break markers are drawn at each A4 boundary and the sheet
 * grows a whole page at a time, so the document reads "per pagine".
 */

// A4 at 96 dpi. Width is fixed so pagination is stable; height defines the
// page boundary used for the break markers and the minimum sheet height.
const PAGE_HEIGHT_PX = 1123;
// Vertical padding of the sheet (top + bottom), see globals.css .page-sheet.
const SHEET_VPAD_PX = 152;

export function DocumentSheet({ editor }: { editor: Editor | null }) {
  const [pages, setPages] = useState(1);

  useEffect(() => {
    if (!editor) return;
    const contentEl = editor.view.dom as HTMLElement;

    const measure = () => {
      const contentHeight = contentEl.scrollHeight + SHEET_VPAD_PX;
      setPages(Math.max(1, Math.ceil(contentHeight / PAGE_HEIGHT_PX)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [editor]);

  return (
    <div className="pages-viewport">
      <div
        className="page-sheet"
        style={{ minHeight: `${pages * PAGE_HEIGHT_PX}px` }}
      >
        {Array.from({ length: pages - 1 }, (_, i) => (
          <div
            key={i}
            className="page-break"
            style={{ top: `${(i + 1) * PAGE_HEIGHT_PX}px` }}
            aria-hidden="true"
          >
            <span>Pagina {i + 2}</span>
          </div>
        ))}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
