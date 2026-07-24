"use client";

import { useEffect, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { computeLineLayout } from "@/editor/visual-lines";

/**
 * The document surface — a single continuous sheet (not paginated). Every
 * rendered line, including each wrapped line inside a paragraph, is numbered in
 * the left gutter. It is the only thing the user reads; not user-editable
 * (dictation drives all changes).
 */
export function DocumentSheet({ editor }: { editor: Editor | null }) {
  const [numbers, setNumbers] = useState<{ n: number; top: number }[]>([]);
  const [gutterLeft, setGutterLeft] = useState(8);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    let raf = 0;

    const recompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const layout = computeLineLayout(dom);
        const offsetTop = dom.offsetTop;
        setNumbers(layout.numbers.map((l) => ({ n: l.n, top: offsetTop + l.top })));
        setGutterLeft(Math.max(dom.offsetLeft - 56, 8));
      });
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(dom);
    editor.on("update", recompute);
    window.addEventListener("resize", recompute);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      editor.off("update", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [editor]);

  return (
    <div className="sheet-scroll">
      <div className="sheet">
        <div className="line-gutter" aria-hidden="true">
          {numbers.map((l) => (
            <span key={l.n} style={{ top: `${l.top}px`, left: `${gutterLeft}px` }}>
              {l.n}
            </span>
          ))}
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
