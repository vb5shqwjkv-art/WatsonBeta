import { describe, expect, it } from "vitest";
import { selectContextBlocks } from "@/core/context/context-manager";
import type {
  DocumentIndex,
  IndexedBlock,
  SelectionState,
} from "@/core/document/types";
import { EMPTY_SELECTION } from "@/core/document/types";

function makeIndex(count: number): DocumentIndex {
  const blocks: IndexedBlock[] = Array.from({ length: count }, (_, i) => ({
    blockId: `blk_${i}`,
    line: i + 1,
    type: "paragraph",
    textPreview: `block ${i}`,
    path: [i],
  }));
  return { blocks, docVersion: 1 };
}

function cursorOn(blockId: string): SelectionState {
  return {
    anchorBlockId: blockId,
    headBlockId: blockId,
    isCollapsed: true,
    selectedText: "",
  };
}

describe("selectContextBlocks", () => {
  it("returns the whole outline when it fits the budget", () => {
    const index = makeIndex(5);
    const result = selectContextBlocks(index, EMPTY_SELECTION, 10);
    expect(result.index.blocks).toHaveLength(5);
    expect(result.hiddenBefore).toBe(0);
    expect(result.hiddenAfter).toBe(0);
  });

  it("windows around the focused block for long documents", () => {
    const index = makeIndex(20);
    const result = selectContextBlocks(index, cursorOn("blk_15"), 6);
    expect(result.index.blocks).toHaveLength(6);
    // The focused block must be inside the window.
    const ids = result.index.blocks.map((b) => b.blockId);
    expect(ids).toContain("blk_15");
    // The hidden counts must account for everything not shown.
    expect(result.hiddenBefore + 6 + result.hiddenAfter).toBe(20);
  });

  it("defaults the window to the document end when there is no selection", () => {
    const index = makeIndex(20);
    const result = selectContextBlocks(index, EMPTY_SELECTION, 4);
    expect(result.index.blocks.map((b) => b.blockId)).toContain("blk_19");
    expect(result.hiddenAfter).toBe(0);
    expect(result.hiddenBefore).toBe(16);
  });
});
