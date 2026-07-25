import type { JSONContent } from "@tiptap/core";
import type {
  ContentSpec,
  CreateComparisonOp,
  CreateListOp,
  CreateTableOp,
} from "@/core/operations";

/**
 * Deterministic construction of ProseMirror/Tiptap JSON from the AI's
 * high-level content specs. Keeping this pure and centralized means table and
 * list creation are predictable and unit-testable, not ad-hoc string building.
 */

function textNode(text: string): JSONContent[] {
  return text.length > 0 ? [{ type: "text", text }] : [];
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: textNode(text) };
}

/** Split dictated text into paragraphs on blank lines. */
function toParagraphs(text: string): JSONContent[] {
  const chunks = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return chunks.length > 0 ? chunks.map(paragraph) : [paragraph(text.trim())];
}

/** Convert a {@link ContentSpec} into insertable block JSON. */
export function contentSpecToJSON(spec: ContentSpec): JSONContent[] {
  const text = spec.text ?? "";
  switch (spec.as) {
    case "heading":
      return [{ type: "heading", attrs: { level: 2 }, content: textNode(text) }];
    case "codeBlock":
      return [{ type: "codeBlock", content: textNode(text) }];
    case "blockquote":
      return [{ type: "blockquote", content: toParagraphs(text) }];
    default:
      return toParagraphs(text);
  }
}

function cell(text: string, header: boolean): JSONContent {
  return {
    type: header ? "tableHeader" : "tableCell",
    content: [paragraph(text)],
  };
}

/** Build a fully-formed table node, prefilled from `data` when provided. */
export function buildTableJSON(op: CreateTableOp): JSONContent {
  const rows: JSONContent[] = [];
  for (let r = 0; r < op.rows; r++) {
    const isHeader = op.withHeaderRow && r === 0;
    const cells: JSONContent[] = [];
    for (let c = 0; c < op.cols; c++) {
      const value = op.data?.[r]?.[c] ?? "";
      cells.push(cell(value, isHeader));
    }
    rows.push({ type: "tableRow", content: cells });
  }
  return { type: "table", content: rows };
}

/**
 * Build a comparison: N equal side-by-side columns. Each column starts with its
 * bold title (when given) and an empty paragraph that later dictation flows into
 * — so content stays within the column instead of spanning the page.
 */
export function buildComparisonJSON(op: CreateComparisonOp): JSONContent {
  const columns: JSONContent[] = [];
  for (let i = 0; i < op.columns; i++) {
    const title = op.titles?.[i]?.trim();
    const content: JSONContent[] = [];
    if (title) {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: title, marks: [{ type: "bold" }] }],
      });
    }
    // Always leave an empty paragraph for content to flow into.
    content.push({ type: "paragraph" });
    columns.push({ type: "comparisonColumn", content });
  }
  return { type: "comparison", content: columns };
}

/** Build a bullet / ordered / task list from item texts. */
export function buildListJSON(op: CreateListOp): JSONContent {
  if (op.listKind === "task") {
    return {
      type: "taskList",
      content: op.items.map((text) => ({
        type: "taskItem",
        attrs: { checked: false },
        content: [paragraph(text)],
      })),
    };
  }
  return {
    type: op.listKind === "ordered" ? "orderedList" : "bulletList",
    content: op.items.map((text) => ({
      type: "listItem",
      content: [paragraph(text)],
    })),
  };
}
