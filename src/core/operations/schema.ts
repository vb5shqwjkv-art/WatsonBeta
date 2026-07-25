import { z } from "zod";
import { BlockType, MarkType, TextAlign } from "@/core/document/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * The Operation DSL — the language the AI speaks to the editor
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The reasoning engine never emits raw ProseMirror JSON. It emits operations
 * from this closed, validated set. These Zod schemas are the single source of
 * truth: TypeScript types are inferred from them (see `./types.ts`), and the
 * OpenAI tool/function definitions are derived from them (see `../ai/tools.ts`).
 *
 * Every operation that mutates content addresses a `TargetRef` or `Position`,
 * which is how referential language ("that", "this part", "above") is grounded
 * to concrete, stable block ids.
 */

const enumValues = <T extends Record<string, string>>(o: T) =>
  Object.values(o) as [string, ...string[]];

/* ── References ──────────────────────────────────────────────────────────── */

/**
 * A resolvable reference to existing content. Symbolic refs (`@selection`,
 * `@last`, `@document`) are resolved by the editor against live state; a
 * `block` ref names an explicit stable id.
 */
export const TargetRefSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("selection") })
    .describe("The user's current selection or cursor block ('this', 'that')."),
  z
    .object({ kind: z.literal("last") })
    .describe("The most recently created/edited block ('it', 'the last one')."),
  z
    .object({ kind: z.literal("document") })
    .describe("The whole document."),
  z
    .object({ kind: z.literal("block"), blockId: z.string() })
    .describe("An explicit block, by stable id from the document index."),
  z
    .object({ kind: z.literal("line"), line: z.number().int().min(1) })
    .describe("A block by its 1-based line number ('al rigo 4')."),
  z
    .object({
      kind: z.literal("word"),
      word: z.string(),
      occurrence: z.number().int().min(1).default(1),
      line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Restrict the search to this line's block."),
    })
    .describe("A specific word ('la parola osso'), optionally on a given line."),
]);

/** An insertion point for new content. */
export const PositionSchema = z.discriminatedUnion("at", [
  z.object({ at: z.literal("cursor") }).describe("At the current cursor."),
  z.object({ at: z.literal("documentStart") }),
  z.object({ at: z.literal("documentEnd") }),
  z.object({ at: z.literal("before"), blockId: z.string() }),
  z.object({ at: z.literal("after"), blockId: z.string() }),
  z
    .object({ at: z.literal("beforeLine"), line: z.number().int().min(1) })
    .describe("Before the block at this 1-based line number."),
  z
    .object({ at: z.literal("afterLine"), line: z.number().int().min(1) })
    .describe("After the block at this 1-based line number."),
]);

/* ── Content ─────────────────────────────────────────────────────────────── */

/** Plain text to write. Double newlines split into separate paragraphs. */
export const ContentSpecSchema = z.object({
  text: z.string().describe("The text to write."),
  as: z
    .enum(enumValues(BlockType))
    .optional()
    .describe("Block type to wrap the text in; defaults to paragraph."),
});

export const MarkSpecSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(MarkType.Bold) }),
  z.object({ type: z.literal(MarkType.Italic) }),
  z.object({ type: z.literal(MarkType.Underline) }),
  z.object({ type: z.literal(MarkType.Strike) }),
  z.object({ type: z.literal(MarkType.Code) }),
  z.object({ type: z.literal(MarkType.Highlight), color: z.string().optional() }),
  z.object({ type: z.literal(MarkType.Link), href: z.string() }),
  z
    .object({ type: z.literal(MarkType.Color), color: z.string() })
    .describe("Text color as a CSS color, e.g. 'red', '#e11d48'."),
]);

/* ── Table operations ────────────────────────────────────────────────────── */

export const TableOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("swapColumns"), a: z.number().int(), b: z.number().int() }),
  z.object({ op: z.literal("swapRows"), a: z.number().int(), b: z.number().int() }),
  z.object({ op: z.literal("addRow"), at: z.number().int().optional() }),
  z.object({ op: z.literal("addColumn"), at: z.number().int().optional() }),
  z.object({ op: z.literal("deleteRow"), at: z.number().int() }),
  z.object({ op: z.literal("deleteColumn"), at: z.number().int() }),
  z.object({
    op: z.literal("setCell"),
    row: z.number().int(),
    col: z.number().int(),
    text: z.string(),
  }),
  z.object({ op: z.literal("toggleHeaderRow") }),
]);

/* ── Operations ──────────────────────────────────────────────────────────── */

export const InsertContentSchema = z.object({
  type: z.literal("insert_content"),
  position: PositionSchema.default({ at: "cursor" }),
  content: ContentSpecSchema,
});

export const ReplaceContentSchema = z.object({
  type: z.literal("replace_content"),
  target: TargetRefSchema,
  content: ContentSpecSchema,
});

export const DeleteContentSchema = z.object({
  type: z.literal("delete_content"),
  target: TargetRefSchema,
});

export const MoveContentSchema = z.object({
  type: z.literal("move_content"),
  target: TargetRefSchema,
  destination: PositionSchema,
});

export const FormatTextSchema = z.object({
  type: z.literal("format_text"),
  target: TargetRefSchema,
  marks: z.array(MarkSpecSchema).min(1),
  mode: z.enum(["add", "remove", "toggle"]).default("add"),
});

export const SetBlockTypeSchema = z.object({
  type: z.literal("set_block_type"),
  target: TargetRefSchema,
  blockType: z.enum(enumValues(BlockType)),
  level: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe("Heading level, when blockType is 'heading'."),
});

export const SetAlignmentSchema = z.object({
  type: z.literal("set_alignment"),
  target: TargetRefSchema,
  align: z.enum(enumValues(TextAlign)),
});

export const SetFontSizeSchema = z.object({
  type: z.literal("set_font_size"),
  target: TargetRefSchema,
  size: z.discriminatedUnion("mode", [
    z
      .object({ mode: z.literal("absolute"), points: z.number().int().min(6).max(96) })
      .describe("An explicit size in points, e.g. 14."),
    z
      .object({ mode: z.literal("relative"), deltaPoints: z.number().int().min(-40).max(40) })
      .describe("Points relative to the normal text, e.g. +2 = 'two larger'."),
    z.object({ mode: z.literal("reset") }).describe("Back to the normal size."),
  ]),
});

export const CreateTableSchema = z.object({
  type: z.literal("create_table"),
  position: PositionSchema.default({ at: "cursor" }),
  rows: z.number().int().min(1).max(50),
  cols: z.number().int().min(1).max(20),
  withHeaderRow: z.boolean().default(true),
  data: z
    .array(z.array(z.string()))
    .optional()
    .describe("Optional row-major cell contents to prefill."),
});

export const ModifyTableSchema = z.object({
  type: z.literal("modify_table"),
  tableId: z.string(),
  operation: TableOpSchema,
});

export const CreateListSchema = z.object({
  type: z.literal("create_list"),
  position: PositionSchema.default({ at: "cursor" }),
  listKind: z.enum(["bullet", "ordered", "task"]),
  items: z.array(z.string()).min(1),
});

/* ── Generative operations (re-invoke the LLM on a focused region) ───────── */

export const TransformContentSchema = z.object({
  type: z.literal("transform_content"),
  target: TargetRefSchema,
  instruction: z
    .string()
    .describe("How to rewrite the target, e.g. 'more scientific', 'simpler'."),
});

export const SummarizeSchema = z.object({
  type: z.literal("summarize"),
  target: TargetRefSchema,
  targetLength: z
    .enum(["oneLine", "short", "medium"])
    .default("short")
    .describe("Roughly how concise the summary should be."),
});

/* ── Meta operations ─────────────────────────────────────────────────────── */

export const UndoSchema = z.object({
  type: z.literal("undo"),
  steps: z.number().int().min(1).default(1),
});

export const ClearDocumentSchema = z.object({
  type: z.literal("clear_document"),
});

export const AnnotateSchema = z.object({
  type: z.literal("annotate"),
  target: TargetRefSchema,
  word: z
    .string()
    .optional()
    .describe("The exact word to anchor the arrow to, e.g. 'osso'. Omit for the whole line."),
  occurrence: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("Which occurrence of the word within the block (usually 1)."),
  direction: z.enum(["down", "up", "left", "right"]).default("down"),
  color: z
    .string()
    .optional()
    .describe("Ignored: the arrow always inherits the anchored word's text color."),
  size: z
    .enum(["normal", "big"])
    .default("normal")
    .describe("Ignored: the arrow is always sized to the text line it points at."),
});

export const ClearAnnotationsSchema = z.object({
  type: z.literal("clear_annotations"),
});

export const ExportDocumentSchema = z.object({
  type: z.literal("export_document"),
  format: z
    .enum(["pdf", "docx"])
    .describe("Export the finished document as a PDF or a Word (.docx) file."),
});

export const ReplySchema = z.object({
  type: z.literal("reply"),
  message: z
    .string()
    .describe("A conversational reply when no document edit is needed."),
});

/** The full discriminated union of every operation the AI may emit. */
export const OperationSchema = z.discriminatedUnion("type", [
  InsertContentSchema,
  ReplaceContentSchema,
  DeleteContentSchema,
  MoveContentSchema,
  FormatTextSchema,
  SetBlockTypeSchema,
  SetAlignmentSchema,
  SetFontSizeSchema,
  CreateTableSchema,
  ModifyTableSchema,
  CreateListSchema,
  TransformContentSchema,
  SummarizeSchema,
  AnnotateSchema,
  ClearAnnotationsSchema,
  UndoSchema,
  ClearDocumentSchema,
  ExportDocumentSchema,
  ReplySchema,
]);

/** Every operation `type` string, useful for routing and telemetry. */
export const OPERATION_TYPES = [
  "insert_content",
  "replace_content",
  "delete_content",
  "move_content",
  "format_text",
  "set_block_type",
  "set_alignment",
  "set_font_size",
  "create_table",
  "modify_table",
  "create_list",
  "transform_content",
  "summarize",
  "annotate",
  "clear_annotations",
  "undo",
  "clear_document",
  "export_document",
  "reply",
] as const;

/** Operations whose execution requires a second, focused LLM call. */
export const GENERATIVE_OPERATION_TYPES = [
  "transform_content",
  "summarize",
] as const;
