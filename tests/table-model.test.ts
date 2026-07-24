import { describe, expect, it } from "vitest";
import {
  applyTableOp,
  tableModelToJSON,
  type TableModel,
} from "@/editor/table-model";

const grid = (): TableModel => ({
  hasHeaderRow: true,
  cells: [
    ["H1", "H2"],
    ["a", "b"],
    ["c", "d"],
  ],
});

function unwrap(model: TableModel, op: Parameters<typeof applyTableOp>[1]) {
  const r = applyTableOp(model, op);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("applyTableOp", () => {
  it("swaps two columns across every row", () => {
    const out = unwrap(grid(), { op: "swapColumns", a: 0, b: 1 });
    expect(out.cells).toEqual([
      ["H2", "H1"],
      ["b", "a"],
      ["d", "c"],
    ]);
  });

  it("swaps two rows", () => {
    const out = unwrap(grid(), { op: "swapRows", a: 1, b: 2 });
    expect(out.cells[1]).toEqual(["c", "d"]);
    expect(out.cells[2]).toEqual(["a", "b"]);
  });

  it("adds an empty row of the right width", () => {
    const out = unwrap(grid(), { op: "addRow" });
    expect(out.cells).toHaveLength(4);
    expect(out.cells[3]).toEqual(["", ""]);
  });

  it("adds a column to every row", () => {
    const out = unwrap(grid(), { op: "addColumn", at: 1 });
    expect(out.cells[0]).toEqual(["H1", "", "H2"]);
    expect(out.cells[1]).toEqual(["a", "", "b"]);
  });

  it("deletes a row and a column", () => {
    expect(unwrap(grid(), { op: "deleteRow", at: 1 }).cells).toEqual([
      ["H1", "H2"],
      ["c", "d"],
    ]);
    expect(unwrap(grid(), { op: "deleteColumn", at: 0 }).cells).toEqual([
      ["H2"],
      ["b"],
      ["d"],
    ]);
  });

  it("sets a single cell", () => {
    const out = unwrap(grid(), { op: "setCell", row: 1, col: 0, text: "X" });
    expect(out.cells[1]).toEqual(["X", "b"]);
  });

  it("toggles the header row", () => {
    expect(unwrap(grid(), { op: "toggleHeaderRow" }).hasHeaderRow).toBe(false);
  });

  it("rejects out-of-range indices", () => {
    expect(applyTableOp(grid(), { op: "swapColumns", a: 0, b: 5 }).ok).toBe(false);
    expect(applyTableOp(grid(), { op: "deleteRow", at: 9 }).ok).toBe(false);
  });

  it("refuses to delete the last row or column", () => {
    const single: TableModel = { hasHeaderRow: false, cells: [["only"]] };
    expect(applyTableOp(single, { op: "deleteRow", at: 0 }).ok).toBe(false);
    expect(applyTableOp(single, { op: "deleteColumn", at: 0 }).ok).toBe(false);
  });

  it("does not mutate the input model", () => {
    const input = grid();
    unwrap(input, { op: "setCell", row: 0, col: 0, text: "changed" });
    expect(input.cells[0]?.[0]).toBe("H1");
  });
});

describe("tableModelToJSON", () => {
  it("renders header cells only in the first row when hasHeaderRow", () => {
    const json = tableModelToJSON(grid());
    const rows = json.content ?? [];
    const firstRowCells = rows[0]?.content ?? [];
    const secondRowCells = rows[1]?.content ?? [];
    expect(firstRowCells[0]?.type).toBe("tableHeader");
    expect(secondRowCells[0]?.type).toBe("tableCell");
  });
});
