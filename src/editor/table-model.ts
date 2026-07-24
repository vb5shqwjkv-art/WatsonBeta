import type { JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { type Result, appError, err, ok } from "@/lib/result";
import type { TableOp } from "@/core/operations";

/**
 * A plain 2-D view of a table's text content. Modeling table edits as a pure
 * transform of this grid (then rebuilding the node) keeps "swap the columns",
 * "invert", "delete row" deterministic and unit-testable, instead of fragile
 * in-place ProseMirror position arithmetic.
 */
export interface TableModel {
  readonly hasHeaderRow: boolean;
  /** Row-major cell text: `cells[row][col]`. */
  readonly cells: readonly (readonly string[])[];
}

/** Read a ProseMirror table node into a {@link TableModel}. */
export function readTableModel(table: PMNode): TableModel {
  const cells: string[][] = [];
  let hasHeaderRow = false;

  table.forEach((row, _offset, rowIndex) => {
    const rowCells: string[] = [];
    let allHeader = row.childCount > 0;
    row.forEach((cellNode) => {
      if (cellNode.type.name !== "tableHeader") allHeader = false;
      rowCells.push(cellNode.textContent);
    });
    if (rowIndex === 0 && allHeader) hasHeaderRow = true;
    cells.push(rowCells);
  });

  return { hasHeaderRow, cells };
}

function colCount(model: TableModel): number {
  return model.cells[0]?.length ?? 0;
}

function clone(model: TableModel): string[][] {
  return model.cells.map((r) => [...r]);
}

const inRange = (i: number, n: number) => i >= 0 && i < n;

/** Apply a {@link TableOp} to the grid, returning a new model or an error. */
export function applyTableOp(
  model: TableModel,
  op: TableOp,
): Result<TableModel> {
  const rows = model.cells.length;
  const cols = colCount(model);
  const cells = clone(model);

  switch (op.op) {
    case "swapColumns": {
      if (!inRange(op.a, cols) || !inRange(op.b, cols)) {
        return err(appError("unsupported", "Column index out of range."));
      }
      for (const row of cells) {
        const tmp = row[op.a]!;
        row[op.a] = row[op.b]!;
        row[op.b] = tmp;
      }
      return ok({ ...model, cells });
    }
    case "swapRows": {
      if (!inRange(op.a, rows) || !inRange(op.b, rows)) {
        return err(appError("unsupported", "Row index out of range."));
      }
      const tmp = cells[op.a]!;
      cells[op.a] = cells[op.b]!;
      cells[op.b] = tmp;
      return ok({ ...model, cells });
    }
    case "addRow": {
      const at = op.at ?? rows;
      if (at < 0 || at > rows) return err(appError("unsupported", "Row index out of range."));
      cells.splice(at, 0, Array.from({ length: cols }, () => ""));
      return ok({ ...model, cells });
    }
    case "addColumn": {
      const at = op.at ?? cols;
      if (at < 0 || at > cols) return err(appError("unsupported", "Column index out of range."));
      for (const row of cells) row.splice(at, 0, "");
      return ok({ ...model, cells });
    }
    case "deleteRow": {
      if (!inRange(op.at, rows)) return err(appError("unsupported", "Row index out of range."));
      if (rows <= 1) return err(appError("unsupported", "Cannot delete the last row."));
      cells.splice(op.at, 1);
      return ok({ ...model, cells });
    }
    case "deleteColumn": {
      if (!inRange(op.at, cols)) return err(appError("unsupported", "Column index out of range."));
      if (cols <= 1) return err(appError("unsupported", "Cannot delete the last column."));
      for (const row of cells) row.splice(op.at, 1);
      return ok({ ...model, cells });
    }
    case "setCell": {
      if (!inRange(op.row, rows) || !inRange(op.col, cols)) {
        return err(appError("unsupported", "Cell coordinates out of range."));
      }
      cells[op.row]![op.col] = op.text;
      return ok({ ...model, cells });
    }
    case "toggleHeaderRow":
      return ok({ ...model, hasHeaderRow: !model.hasHeaderRow });
    default: {
      const _never: never = op;
      return _never;
    }
  }
}

/** Rebuild a table node's JSON from a {@link TableModel}. */
export function tableModelToJSON(model: TableModel): JSONContent {
  return {
    type: "table",
    content: model.cells.map((row, rowIndex) => ({
      type: "tableRow",
      content: row.map((text) => ({
        type: model.hasHeaderRow && rowIndex === 0 ? "tableHeader" : "tableCell",
        content: [
          {
            type: "paragraph",
            content: text.length > 0 ? [{ type: "text", text }] : [],
          },
        ],
      })),
    })),
  };
}
