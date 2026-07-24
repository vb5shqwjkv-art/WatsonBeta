import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { JsonValue } from "@/lib/json";
import type { ToolDefinition } from "./providers/types";
import {
  CreateListSchema,
  CreateTableSchema,
  DeleteContentSchema,
  FormatTextSchema,
  InsertContentSchema,
  ModifyTableSchema,
  MoveContentSchema,
  ReplaceContentSchema,
  ReplySchema,
  RestoreVersionSchema,
  SetAlignmentSchema,
  SetBlockTypeSchema,
  SummarizeSchema,
  TransformContentSchema,
  UndoSchema,
} from "@/core/operations/schema";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Tool definitions exposed to the model
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Each operation is surfaced as its own tool. The tool NAME encodes the
 * operation `type`, so the schemas below omit `type` from the arguments — it
 * is re-attached when a tool call is parsed (see `toOperationPayload`). The
 * parameter JSON Schema is generated from the same Zod schema used for
 * validation, guaranteeing the model's contract and our validator agree.
 */

// Every operation schema is a ZodObject with a `type` literal we strip out.
type OpObject = z.ZodObject<{ type: z.ZodLiteral<string> } & z.ZodRawShape>;

interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly schema: OpObject;
}

/**
 * The registry. Descriptions are written for the model: they explain *when* to
 * reach for each tool in natural, conversational terms — this is where the
 * "reason, don't match keywords" behavior is shaped.
 */
const REGISTRY: readonly ToolSpec[] = [
  {
    name: "insert_content",
    description:
      "Write new text into the document. Use this for plain dictation — when the user is simply saying content to be written. Splits on blank lines into paragraphs.",
    schema: InsertContentSchema as unknown as OpObject,
  },
  {
    name: "replace_content",
    description:
      "Replace the text of an existing block or the selection. Use when the user corrects or restates something already written ('no, it's actually…').",
    schema: ReplaceContentSchema as unknown as OpObject,
  },
  {
    name: "delete_content",
    description:
      "Delete a block or the selection. Use for 'remove this', 'delete that part'.",
    schema: DeleteContentSchema as unknown as OpObject,
  },
  {
    name: "move_content",
    description:
      "Move a block or the selection to another position. Use for 'put this above', 'move it down', 'this goes before the intro'.",
    schema: MoveContentSchema as unknown as OpObject,
  },
  {
    name: "format_text",
    description:
      "Apply or remove inline formatting (bold, italic, underline, strike, code, highlight, link). Use for 'make that bold', 'underline this'.",
    schema: FormatTextSchema as unknown as OpObject,
  },
  {
    name: "set_block_type",
    description:
      "Change a block's type (heading, paragraph, blockquote, code block). Use for 'make this a title', 'turn it into a quote'.",
    schema: SetBlockTypeSchema as unknown as OpObject,
  },
  {
    name: "set_alignment",
    description: "Set text alignment of a block (left, center, right, justify).",
    schema: SetAlignmentSchema as unknown as OpObject,
  },
  {
    name: "create_table",
    description:
      "Create a REAL table (not text describing one). Use for 'make a table', 'let's compare these two things'. Prefill `data` when the content is known.",
    schema: CreateTableSchema as unknown as OpObject,
  },
  {
    name: "modify_table",
    description:
      "Modify an existing table by its id: swap columns/rows, add/delete a row or column, set a cell, toggle the header. Use for 'swap the columns', 'put this in the right column'.",
    schema: ModifyTableSchema as unknown as OpObject,
  },
  {
    name: "create_list",
    description:
      "Create a bulleted, numbered, or checklist list from items. Use for 'make a list', 'turn these into bullet points', 'add a checklist'.",
    schema: CreateListSchema as unknown as OpObject,
  },
  {
    name: "transform_content",
    description:
      "Rewrite a region according to an instruction about STYLE or REGISTER — 'make it more scientific', 'explain it like a professor', 'simpler'. The rewrite itself is generated in a focused follow-up.",
    schema: TransformContentSchema as unknown as OpObject,
  },
  {
    name: "summarize",
    description:
      "Condense a region that is too long. Use for 'this is too long', 'shorten this', 'summarize it'.",
    schema: SummarizeSchema as unknown as OpObject,
  },
  {
    name: "undo",
    description:
      "Undo the last AI action(s). Use for 'no wait', 'go back', 'undo that', 'that was wrong'.",
    schema: UndoSchema as unknown as OpObject,
  },
  {
    name: "restore_version",
    description:
      "Restore a previously saved version of the document. Use for 'restore the previous version', 'the earlier one was better'.",
    schema: RestoreVersionSchema as unknown as OpObject,
  },
  {
    name: "reply",
    description:
      "Answer conversationally WITHOUT editing the document. Use only when the user asks a question or the intent is not to change the document.",
    schema: ReplySchema as unknown as OpObject,
  },
] as const;

/** The set of valid tool names, for fast membership checks. */
export const TOOL_NAMES = new Set(REGISTRY.map((t) => t.name));

let cachedTools: readonly ToolDefinition[] | null = null;

/**
 * Build the vendor-neutral tool definitions handed to a {@link ReasoningProvider}.
 * Memoized — the schemas are static.
 */
export function buildOperationTools(): readonly ToolDefinition[] {
  if (cachedTools) return cachedTools;
  cachedTools = REGISTRY.map((spec) => {
    const argsSchema = spec.schema.omit({ type: true });
    const jsonSchema = zodToJsonSchema(argsSchema, {
      $refStrategy: "none",
      target: "openApi3",
    }) as JsonValue;
    return {
      name: spec.name,
      description: spec.description,
      parameters: jsonSchema,
    } satisfies ToolDefinition;
  });
  return cachedTools;
}

/**
 * Reconstruct a full operation payload from a tool call, re-attaching the
 * `type` discriminant from the tool name. The result still must pass
 * `parseOperation` before execution.
 */
export function toOperationPayload(
  toolName: string,
  args: unknown,
): Record<string, unknown> {
  const base = (args && typeof args === "object" ? args : {}) as Record<
    string,
    unknown
  >;
  return { type: toolName, ...base };
}
