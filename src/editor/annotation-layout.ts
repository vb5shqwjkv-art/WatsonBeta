/**
 * Measures the on-screen rectangle of an annotation's anchor word, so the
 * overlay can draw an arrow pixel-precisely at that word. Browser-only.
 */

export interface AnchorRect {
  /** Viewport coordinates (convert to a container's frame at the call site). */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The computed text color at the anchor, so an arrow can match the word. */
  readonly color: string;
}

/** Build a DOM Range over the Nth occurrence of `needle` inside `el`. */
function rangeForSubstring(
  el: HTMLElement,
  needle: string,
  occurrence: number,
): Range | null {
  const haystack = (el.textContent ?? "").toLowerCase();
  const target = needle.toLowerCase();
  if (target.length === 0) return null;

  let index = -1;
  for (let n = 0; n < occurrence; n++) {
    index = haystack.indexOf(target, index + 1);
    if (index < 0) return null;
  }
  const end = index + target.length;

  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startSet = false;
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (!startSet && index < pos + len) {
      range.setStart(node, index - pos);
      startSet = true;
    }
    if (startSet && end <= pos + len) {
      range.setEnd(node, end - pos);
      return range;
    }
    pos += len;
    node = walker.nextNode();
  }
  return null;
}

/**
 * The rect of an annotation's anchor: the word (if given) or the whole block.
 * `root` is the ProseMirror content element.
 */
export function resolveAnchorRect(
  root: HTMLElement,
  blockId: string,
  word: string,
  occurrence: number,
): AnchorRect | null {
  const block = root.querySelector<HTMLElement>(
    `[data-block-id="${CSS.escape(blockId)}"]`,
  );
  if (!block) return null;

  if (word.trim().length === 0) {
    const r = block.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      color: getComputedStyle(block).color,
    };
  }

  const range = rangeForSubstring(block, word, occurrence);
  if (!range) return null;
  const r = range.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  // Read the color from the element the word actually renders in (its color
  // mark's span when it has one, else the block), so the arrow matches it.
  const host =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as HTMLElement);
  const color = getComputedStyle(host ?? block).color;
  return { left: r.left, top: r.top, width: r.width, height: r.height, color };
}
