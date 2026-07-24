import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { SelectionState } from "@/core/document/types";
import { EMPTY_SELECTION } from "@/core/document/types";

/**
 * Projects the live ProseMirror selection into the id-based {@link SelectionState}
 * the reasoning layer understands. Pure over the editor state.
 */

/** The stable blockId of the nearest addressable ancestor block at `pos`. */
export function blockIdAt(doc: PMNode, pos: number): string | null {
  const clamped = Math.min(Math.max(pos, 0), doc.content.size);
  const $pos = doc.resolve(clamped);
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    const id: unknown = node?.attrs?.blockId;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

export function projectSelection(state: EditorState): SelectionState {
  const { doc, selection } = state;
  const { from, to, empty } = selection;

  const anchorBlockId = blockIdAt(doc, from);
  const headBlockId = blockIdAt(doc, to);
  if (anchorBlockId === null && headBlockId === null) return EMPTY_SELECTION;

  return {
    anchorBlockId,
    headBlockId,
    isCollapsed: empty,
    selectedText: empty ? "" : doc.textBetween(from, to, " ", " "),
  };
}
