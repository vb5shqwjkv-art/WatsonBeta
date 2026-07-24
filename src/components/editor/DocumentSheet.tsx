"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { computeLineLayout } from "@/editor/visual-lines";
import { resolveAnchorRect } from "@/editor/annotation-layout";
import type {
  Annotation,
  ArrowDirection,
} from "@/core/annotations/annotation-manager";

/**
 * The document surface — a single continuous sheet, every rendered line numbered
 * in the gutter. Annotations (arrows anchored to a word) are drawn as a
 * pixel-precise overlay that reflows with the text. Not user-editable.
 */

interface PlacedArrow {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  direction: ArrowDirection;
}

const ROTATION: Record<ArrowDirection, number> = {
  down: 0,
  up: 180,
  left: 90,
  right: -90,
};

function ArrowGlyph({ arrow }: { arrow: PlacedArrow }) {
  return (
    <svg
      width={arrow.size}
      height={arrow.size}
      viewBox="0 0 24 24"
      style={{ position: "absolute", left: arrow.x, top: arrow.y, color: arrow.color }}
      aria-hidden="true"
    >
      <g transform={`rotate(${ROTATION[arrow.direction]} 12 12)`}>
        <path
          d="M12 3 V18 M6 12.5 L12 19 L18 12.5"
          stroke="currentColor"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export function DocumentSheet({
  editor,
  annotations,
}: {
  editor: Editor | null;
  annotations: readonly Annotation[];
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [numbers, setNumbers] = useState<{ n: number; top: number }[]>([]);
  const [gutterLeft, setGutterLeft] = useState(8);
  const [arrows, setArrows] = useState<PlacedArrow[]>([]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    let raf = 0;

    const recompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Line-number gutter.
        const layout = computeLineLayout(dom);
        const offsetTop = dom.offsetTop;
        setNumbers(layout.numbers.map((l) => ({ n: l.n, top: offsetTop + l.top })));
        setGutterLeft(Math.max(dom.offsetLeft - 56, 8));

        // Annotation arrows, positioned relative to the sheet.
        setArrows(placeArrows(dom, sheetRef.current, annotations));
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
  }, [editor, annotations]);

  return (
    <div className="sheet-scroll">
      <div className="sheet" ref={sheetRef}>
        <div className="line-gutter" aria-hidden="true">
          {numbers.map((l) => (
            <span key={l.n} style={{ top: `${l.top}px`, left: `${gutterLeft}px` }}>
              {l.n}
            </span>
          ))}
        </div>
        <div className="annotation-layer" aria-hidden="true">
          {arrows.map((a) => (
            <ArrowGlyph key={a.id} arrow={a} />
          ))}
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

const ARROW_GAP = 4;

function placeArrows(
  dom: HTMLElement,
  sheet: HTMLElement | null,
  annotations: readonly Annotation[],
): PlacedArrow[] {
  if (!sheet) return [];
  const sheetRect = sheet.getBoundingClientRect();
  const placed: PlacedArrow[] = [];

  for (const a of annotations) {
    const anchor = resolveAnchorRect(dom, a.blockId, a.word, a.occurrence);
    if (!anchor) continue;

    const relLeft = anchor.left - sheetRect.left;
    const relTop = anchor.top - sheetRect.top;
    const centerX = relLeft + anchor.width / 2;
    const centerY = relTop + anchor.height / 2;

    let x: number;
    let y: number;
    switch (a.direction) {
      case "down":
        x = centerX - a.sizePx / 2;
        y = relTop + anchor.height + ARROW_GAP;
        break;
      case "up":
        x = centerX - a.sizePx / 2;
        y = relTop - a.sizePx - ARROW_GAP;
        break;
      case "left":
        x = relLeft - a.sizePx - ARROW_GAP;
        y = centerY - a.sizePx / 2;
        break;
      case "right":
        x = relLeft + anchor.width + ARROW_GAP;
        y = centerY - a.sizePx / 2;
        break;
    }
    placed.push({ id: a.id, x, y, size: a.sizePx, color: a.color, direction: a.direction });
  }
  return placed;
}
