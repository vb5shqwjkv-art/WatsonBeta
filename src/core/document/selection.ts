import type { SelectionState } from "./types";

/** Selection helpers. Pure functions over {@link SelectionState}. */

export function hasSelection(sel: SelectionState): boolean {
  return sel.anchorBlockId !== null && !sel.isCollapsed;
}

export function isCursorOnly(sel: SelectionState): boolean {
  return sel.anchorBlockId !== null && sel.isCollapsed;
}

/**
 * The block the user is "on" — the head of the selection, or the cursor block.
 * This is the primary anchor for resolving "this" / "that".
 */
export function focusedBlockId(sel: SelectionState): string | null {
  return sel.headBlockId ?? sel.anchorBlockId;
}
