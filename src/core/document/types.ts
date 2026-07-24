import type { JsonValue } from "@/lib/json";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Document State — the domain model
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The canonical document is a ProseMirror/Tiptap JSON tree. That tree uses
 * *positions* (integer offsets) that shift on every edit — useless as a stable
 * reference for an LLM. We therefore overlay:
 *
 *   1. A stable `blockId` on every block-level node.
 *   2. A lightweight, projected {@link DocumentIndex} (the "outline") — this,
 *      not the full tree, is what we send to the model.
 *   3. A {@link SelectionState} expressed in terms of blockIds, never offsets.
 *
 * The `core` layer treats the raw ProseMirror content as opaque {@link JsonValue}.
 * Only the editor adapter (`src/editor`) interprets and mutates it.
 */

/** Block-level node kinds the assistant can reason about and target. */
export const BlockType = {
  Paragraph: "paragraph",
  Heading: "heading",
  BulletList: "bulletList",
  OrderedList: "orderedList",
  TaskList: "taskList",
  Table: "table",
  CodeBlock: "codeBlock",
  Blockquote: "blockquote",
  Image: "image",
  HorizontalRule: "horizontalRule",
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

/** Inline formatting marks. */
export const MarkType = {
  Bold: "bold",
  Italic: "italic",
  Underline: "underline",
  Strike: "strike",
  Code: "code",
  Highlight: "highlight",
  Link: "link",
  /** Text color (via TextStyle), e.g. "scrivilo in rosso". */
  Color: "color",
} as const;

export type MarkType = (typeof MarkType)[keyof typeof MarkType];

export const TextAlign = {
  Left: "left",
  Center: "center",
  Right: "right",
  Justify: "justify",
} as const;

export type TextAlign = (typeof TextAlign)[keyof typeof TextAlign];

/**
 * A single entry in the projected outline the model consumes. Deliberately
 * compact: enough for referential grounding ("that", "the section above")
 * without shipping the entire document on every turn.
 */
export interface IndexedBlock {
  /** Stable id, mirrored from the node's `attrs.blockId`. */
  readonly blockId: string;
  /**
   * 1-based number of the FIRST visual line this block occupies — the number
   * shown in the gutter and the handle the user references by voice ("al rigo
   * 4"). Measured from the rendered DOM; falls back to block position headless.
   */
  readonly line: number;
  /** How many visual (wrapped) lines the block spans. Defaults to 1. */
  readonly lineSpan?: number;
  readonly type: BlockType;
  /** Heading depth (1–6) when `type === 'heading'`. */
  readonly level?: number;
  /** First ~120 chars of text content, for the model to recognize the block. */
  readonly textPreview: string;
  /** Position path within the tree; primarily for deterministic ordering. */
  readonly path: readonly number[];
  /** Present for structural blocks that carry their own sub-index. */
  readonly table?: TableOutline;
  readonly list?: ListOutline;
}

/** Structural summary of a table so the model can target rows/cols/cells. */
export interface TableOutline {
  readonly tableId: string;
  readonly rows: number;
  readonly cols: number;
  /** Header cell texts, when the first row is a header. */
  readonly headers?: readonly string[];
}

export interface ListOutline {
  readonly listId: string;
  readonly ordered: boolean;
  readonly task: boolean;
  readonly itemCount: number;
}

/**
 * The full projected index. This is the primary "map" of the document handed
 * to the Context Manager, kept in sync with the editor on every transaction.
 */
export interface DocumentIndex {
  readonly blocks: readonly IndexedBlock[];
  /** Monotonic version the index was derived from (optimistic concurrency). */
  readonly docVersion: number;
}

/**
 * Selection/cursor state, always expressed via blockIds. `isCollapsed` marks a
 * bare cursor (no range). `selectedText` lets the model ground phrases like
 * "make this bold" without a second round-trip.
 */
export interface SelectionState {
  readonly anchorBlockId: string | null;
  readonly headBlockId: string | null;
  readonly isCollapsed: boolean;
  readonly selectedText: string;
}

/** An empty/absent selection (e.g. editor not focused). */
export const EMPTY_SELECTION: SelectionState = {
  anchorBlockId: null,
  headBlockId: null,
  isCollapsed: true,
  selectedText: "",
};

/**
 * An opaque, serializable snapshot of the full document content plus the
 * metadata the domain needs. `content` is ProseMirror JSON, treated as opaque
 * here and interpreted only by the editor adapter.
 */
export interface DocumentSnapshot {
  readonly documentId: string;
  readonly title: string;
  readonly content: JsonValue;
  readonly docVersion: number;
  readonly updatedAt: string;
}

/**
 * The complete, live document state as seen by the reasoning pipeline. This is
 * what the Context Manager reads from to assemble a turn.
 */
export interface DocumentState {
  readonly snapshot: DocumentSnapshot;
  readonly index: DocumentIndex;
  readonly selection: SelectionState;
}
