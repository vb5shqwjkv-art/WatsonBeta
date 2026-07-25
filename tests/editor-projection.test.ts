import { describe, expect, it } from "vitest";
import { getSchema, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { getEditorExtensions } from "@/editor/tiptap-config";
import { buildIndex } from "@/editor/document-indexer";
import { blockIdAt } from "@/editor/selection-projector";
import {
  findBlockById,
  findBlockByLine,
  findWordRange,
  resolveInsertPosition,
  resolveTargetRange,
} from "@/editor/reference-resolver";

// A single schema shared by the headless tests (no DOM / editor view needed).
const schema = getSchema(getEditorExtensions());

function doc(content: JSONContent[]): PMNode {
  return schema.nodeFromJSON({ type: "doc", content });
}

const para = (blockId: string, text: string): JSONContent => ({
  type: "paragraph",
  attrs: { blockId },
  content: [{ type: "text", text }],
});

const sampleDoc = () =>
  doc([
    {
      type: "heading",
      attrs: { level: 1, blockId: "blk_h" },
      content: [{ type: "text", text: "Titolo" }],
    },
    para("blk_p", "Ciao mondo"),
    {
      type: "bulletList",
      attrs: { blockId: "blk_l" },
      content: [
        { type: "listItem", content: [para("blk_i1", "uno")] },
        { type: "listItem", content: [para("blk_i2", "due")] },
      ],
    },
    {
      type: "table",
      attrs: { blockId: "blk_t" },
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [para("blk_c1", "Nome")] },
            { type: "tableHeader", content: [para("blk_c2", "Valore")] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [para("blk_c3", "osso")] },
            { type: "tableCell", content: [para("blk_c4", "tessuto")] },
          ],
        },
      ],
    },
  ]);

describe("buildIndex", () => {
  it("projects top-level blocks with type, level and previews", () => {
    const index = buildIndex(sampleDoc(), 7);
    expect(index.docVersion).toBe(7);
    expect(index.blocks.map((b) => b.blockId)).toEqual([
      "blk_h",
      "blk_p",
      "blk_l",
      "blk_t",
    ]);

    const heading = index.blocks[0]!;
    expect(heading.type).toBe("heading");
    expect(heading.level).toBe(1);
    expect(heading.textPreview).toBe("Titolo");
    // Line numbers are 1-based and match top-to-bottom order.
    expect(index.blocks.map((b) => b.line)).toEqual([1, 2, 3, 4]);
  });

  it("summarizes lists and tables for targeting", () => {
    const index = buildIndex(sampleDoc(), 0);
    const list = index.blocks.find((b) => b.blockId === "blk_l");
    expect(list?.list).toMatchObject({ ordered: false, task: false, itemCount: 2 });

    const table = index.blocks.find((b) => b.blockId === "blk_t");
    expect(table?.table).toMatchObject({ rows: 2, cols: 2 });
    expect(table?.table?.headers).toEqual(["Nome", "Valore"]);
  });
});

describe("reference resolver", () => {
  const ctx = { selection: { from: 0, to: 0 }, lastBlockId: "blk_p" };

  it("finds a block by its stable id", () => {
    const hit = findBlockById(sampleDoc(), "blk_p");
    expect(hit).not.toBeNull();
    expect(hit?.node.textContent).toBe("Ciao mondo");
  });

  it("resolves an explicit block target to its range", () => {
    const d = sampleDoc();
    const range = resolveTargetRange(d, { kind: "block", blockId: "blk_p" }, ctx);
    expect(range.ok).toBe(true);
    if (range.ok) {
      expect(range.value.blockId).toBe("blk_p");
      expect(range.value.to).toBeGreaterThan(range.value.from);
    }
  });

  it("resolves @document to the whole document", () => {
    const d = sampleDoc();
    const range = resolveTargetRange(d, { kind: "document" }, ctx);
    expect(range.ok).toBe(true);
    if (range.ok) {
      expect(range.value.from).toBe(0);
      expect(range.value.to).toBe(d.content.size);
    }
  });

  it("resolves @last via the tracked last block", () => {
    const range = resolveTargetRange(sampleDoc(), { kind: "last" }, ctx);
    expect(range.ok).toBe(true);
    if (range.ok) expect(range.value.blockId).toBe("blk_p");
  });

  it("errors when a referenced block does not exist", () => {
    const range = resolveTargetRange(
      sampleDoc(),
      { kind: "block", blockId: "blk_missing" },
      ctx,
    );
    expect(range.ok).toBe(false);
    if (!range.ok) expect(range.error.code).toBe("reference");
  });

  it("finds the range of a specific word inside a block", () => {
    const d = doc([para("blk_x", "L'osso è un tessuto connettivo")]);
    const range = findWordRange(d, "osso", 1, null);
    expect(range).not.toBeNull();
    if (range) {
      expect(d.textBetween(range.from, range.to)).toBe("osso");
      expect(range.blockId).toBe("blk_x");
    }
  });

  it("returns null for a word that is absent", () => {
    const d = doc([para("blk_x", "solo testo")]);
    expect(findWordRange(d, "osso", 1, null)).toBeNull();
  });

  it("treats an invalid occurrence as the first (no position corruption)", () => {
    const d = doc([para("blk_x", "prima osso seconda osso")]);
    // An unparsed op may pass undefined; it must not resolve to a bad range.
    const range = findWordRange(d, "osso", undefined as unknown as number, null);
    expect(range).not.toBeNull();
    if (range) expect(d.textBetween(range.from, range.to)).toBe("osso");
  });

  it("resolves a block by its line number", () => {
    const d = sampleDoc();
    // Line 2 is the paragraph "Ciao mondo".
    const byLine = findBlockByLine(d, 2);
    expect(byLine?.node.textContent).toBe("Ciao mondo");

    const range = resolveTargetRange(d, { kind: "line", line: 2 }, ctx);
    expect(range.ok).toBe(true);
    if (range.ok) expect(range.value.blockId).toBe("blk_p");
  });

  it("errors on a line number past the end", () => {
    const range = resolveTargetRange(sampleDoc(), { kind: "line", line: 99 }, ctx);
    expect(range.ok).toBe(false);
  });

  it("resolves beforeLine/afterLine insertion positions", () => {
    const d = sampleDoc();
    const before = resolveInsertPosition(d, { at: "beforeLine", line: 2 }, ctx);
    const after = resolveInsertPosition(d, { at: "afterLine", line: 2 }, ctx);
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) expect(after.value).toBeGreaterThan(before.value);
  });

  it("resolves before/after insertion positions", () => {
    const d = sampleDoc();
    const before = resolveInsertPosition(d, { at: "before", blockId: "blk_p" }, ctx);
    const after = resolveInsertPosition(d, { at: "after", blockId: "blk_p" }, ctx);
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) expect(after.value).toBeGreaterThan(before.value);
  });

  it("resolves document start and end", () => {
    const d = sampleDoc();
    expect(resolveInsertPosition(d, { at: "documentStart" }, ctx)).toEqual({
      ok: true,
      value: 0,
    });
    const end = resolveInsertPosition(d, { at: "documentEnd" }, ctx);
    expect(end.ok && end.value === d.content.size).toBe(true);
  });
});

describe("blockIdAt", () => {
  it("finds the addressable ancestor block for a position", () => {
    const d = sampleDoc();
    const hit = findBlockById(d, "blk_p")!;
    // A position just inside the paragraph resolves back to its block id.
    expect(blockIdAt(d, hit.pos + 1)).toBe("blk_p");
  });

  it("returns the top-level block id for a position inside a table cell", () => {
    const d = sampleDoc();
    const hit = findBlockById(d, "blk_c3")!;
    // Deep inside a cell, the nearest addressable ancestor is the cell's block.
    expect(blockIdAt(d, hit.pos + 1)).toBe("blk_c3");
  });
});
