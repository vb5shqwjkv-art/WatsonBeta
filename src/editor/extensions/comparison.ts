import { Node, mergeAttributes } from "@tiptap/core";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Comparison — side-by-side columns (NOT a table)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * "compariamo A, B, C" lays the sheet out into N equal columns, each 1/N of the
 * width, so content dictated for one item stays inside that column and wraps
 * within it instead of running across the whole page. Rendered as a flex row of
 * columns — visually columns, not a bordered table grid.
 *
 *   comparison            → a flex row
 *     comparisonColumn+   → one flexible, equal-width column (holds blocks)
 */

export const Comparison = Node.create({
  name: "comparison",
  group: "block",
  content: "comparisonColumn+",
  isolating: true,
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: "div[data-comparison]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-comparison": "", class: "comparison" }),
      0,
    ];
  },
});

export const ComparisonColumn = Node.create({
  name: "comparisonColumn",
  content: "block+",
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-comparison-column]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-comparison-column": "",
        class: "comparison-column",
      }),
      0,
    ];
  },
});
