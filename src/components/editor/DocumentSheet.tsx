"use client";

import { EditorContent, type Editor } from "@tiptap/react";

/**
 * The document surface — a clean, Word-like page. It is the only thing the user
 * reads: everything they dictate appears here. Not user-editable (dictation
 * drives all changes); it renders the live editor state.
 */
export function DocumentSheet({ editor }: { editor: Editor | null }) {
  return (
    <div className="sheet-scroll">
      <div className="sheet">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
