/**
 * ─────────────────────────────────────────────────────────────────────────
 * Visual line layout
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Numbers EVERY rendered line — including each wrapped line inside a paragraph —
 * not each block. Because visual lines depend on wrapping, they can only be
 * measured from the laid-out DOM (getClientRects). This produces:
 *   - `numbers`: the y-position of every line, for the gutter;
 *   - `blockStart` / `blockSpan`: which visual lines each top-level block spans,
 *     so the AI's "rigo N" can be mapped to a concrete block.
 *
 * Browser-only (uses Range/getClientRects); never imported by the pure core.
 */

export interface LineLayout {
  /** One entry per visual line: its number and top offset (relative to root). */
  readonly numbers: { n: number; top: number }[];
  /** blockId → first visual line number it occupies. */
  readonly blockStart: Map<string, number>;
  /** blockId → how many visual lines it occupies. */
  readonly blockSpan: Map<string, number>;
}

const LEAF_SELECTOR = "p, h1, h2, h3, h4, h5, h6, pre";
// Two rects within this vertical distance are treated as the same visual line.
const SAME_LINE_PX = 8;

const EMPTY_LAYOUT: LineLayout = {
  numbers: [],
  blockStart: new Map(),
  blockSpan: new Map(),
};

/** The direct child of `root` that contains `el` (its top-level block). */
function topLevelBlockOf(el: HTMLElement, root: HTMLElement): HTMLElement {
  let cur = el;
  while (cur.parentElement && cur.parentElement !== root) {
    cur = cur.parentElement;
  }
  return cur;
}

/** The distinct line tops of a single text-bearing element. */
function lineTopsOf(el: HTMLElement): number[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  let rects = Array.from(range.getClientRects()).filter(
    (r) => r.width > 0 || r.height > 0,
  );
  if (rects.length === 0) rects = [el.getBoundingClientRect()];

  const tops: number[] = [];
  for (const r of rects) {
    if (tops.length === 0 || Math.abs(r.top - tops[tops.length - 1]!) > SAME_LINE_PX) {
      tops.push(r.top);
    }
  }
  return tops;
}

export function computeLineLayout(root: HTMLElement): LineLayout {
  if (typeof document === "undefined" || !root) return EMPTY_LAYOUT;

  const rootTop = root.getBoundingClientRect().top;
  const raw: { top: number; blockId: string | null }[] = [];

  root.querySelectorAll<HTMLElement>(LEAF_SELECTOR).forEach((leaf) => {
    const block = topLevelBlockOf(leaf, root);
    const blockId = block.getAttribute("data-block-id");
    for (const top of lineTopsOf(leaf)) {
      raw.push({ top: top - rootTop, blockId });
    }
  });

  raw.sort((a, b) => a.top - b.top);

  // Merge rects that belong to the same visual line (e.g. cells in a table row).
  const lines: { top: number; blockId: string | null }[] = [];
  for (const item of raw) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(item.top - last.top) < SAME_LINE_PX) {
      if (last.blockId === null && item.blockId) last.blockId = item.blockId;
      continue;
    }
    lines.push({ ...item });
  }

  const numbers = lines.map((l, i) => ({ n: i + 1, top: l.top }));
  const blockStart = new Map<string, number>();
  const blockSpan = new Map<string, number>();
  lines.forEach((l, i) => {
    if (!l.blockId) return;
    if (!blockStart.has(l.blockId)) blockStart.set(l.blockId, i + 1);
    blockSpan.set(l.blockId, (blockSpan.get(l.blockId) ?? 0) + 1);
  });

  return { numbers, blockStart, blockSpan };
}
