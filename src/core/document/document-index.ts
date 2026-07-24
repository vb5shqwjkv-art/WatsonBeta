import type { DocumentIndex, IndexedBlock } from "./types";

/**
 * Read helpers over the projected {@link DocumentIndex}. The index itself is
 * produced by the editor adapter (which walks the ProseMirror tree); these
 * helpers are pure and shared by the reasoning/context layers.
 */

export const EMPTY_INDEX: DocumentIndex = { blocks: [], docVersion: 0 };

export function findBlock(
  index: DocumentIndex,
  blockId: string,
): IndexedBlock | undefined {
  return index.blocks.find((b) => b.blockId === blockId);
}

export function blockPosition(
  index: DocumentIndex,
  blockId: string,
): number {
  return index.blocks.findIndex((b) => b.blockId === blockId);
}

/** The last block in document order, i.e. the `@last` fallback target. */
export function lastBlock(index: DocumentIndex): IndexedBlock | undefined {
  return index.blocks.at(-1);
}

/** The block immediately before/after a given block, if any. */
export function neighborBlock(
  index: DocumentIndex,
  blockId: string,
  direction: "before" | "after",
): IndexedBlock | undefined {
  const i = blockPosition(index, blockId);
  if (i < 0) return undefined;
  return index.blocks[direction === "before" ? i - 1 : i + 1];
}

/** All heading blocks, for outline/navigation features. */
export function headings(index: DocumentIndex): IndexedBlock[] {
  return index.blocks.filter((b) => b.type === "heading");
}
