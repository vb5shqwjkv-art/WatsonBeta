import { z } from "zod";
import { type Result, appError, err, ok } from "@/lib/result";
import {
  GENERATIVE_OPERATION_TYPES,
  OperationSchema,
} from "./schema";
import type { Operation, OperationType } from "./types";

export * from "./types";
export {
  OperationSchema,
  OPERATION_TYPES,
  GENERATIVE_OPERATION_TYPES,
} from "./schema";

/**
 * Parse and validate an operation coming from the model. Returns a `Result`
 * rather than throwing so a malformed tool call is handled, not fatal.
 */
export function parseOperation(input: unknown): Result<Operation> {
  const parsed = OperationSchema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return err(
    appError("validation", "Invalid operation payload.", {
      issues: parsed.error.issues,
    }),
  );
}

/** Validate an array of operations, short-circuiting on the first failure. */
export function parseOperations(input: unknown): Result<Operation[]> {
  const asArray = z.array(z.unknown()).safeParse(input);
  if (!asArray.success) {
    return err(appError("validation", "Expected an array of operations."));
  }
  const out: Operation[] = [];
  for (const [i, raw] of asArray.data.entries()) {
    const one = parseOperation(raw);
    if (!one.ok) {
      return err(
        appError("validation", `Operation at index ${i} is invalid.`, one.error.detail),
      );
    }
    out.push(one.value);
  }
  return ok(out);
}

const generativeSet = new Set<OperationType>(GENERATIVE_OPERATION_TYPES);

/** Whether executing this operation requires a second, focused LLM call. */
export function isGenerativeOperation(op: Operation): boolean {
  return generativeSet.has(op.type);
}

/** Whether this operation mutates document content (vs. reply/meta). */
export function isMutating(op: Operation): boolean {
  return op.type !== "reply";
}

/**
 * Whether this operation irreversibly removes or overwrites existing content.
 * The Editor Controller uses this to gate confirmation for risky edits when the
 * model's confidence is low — the "threshold before destructive actions"
 * mitigation for mis-heard speech. (Every such op is still covered by semantic
 * undo; this is a guard against silent data loss, not a substitute for undo.)
 */
export function isDestructive(op: Operation): boolean {
  switch (op.type) {
    case "delete_content":
    case "replace_content":
    case "restore_version":
      return true;
    case "modify_table":
      return (
        op.operation.op === "deleteRow" || op.operation.op === "deleteColumn"
      );
    default:
      return false;
  }
}

/** A short human-readable description, used for checkpoint labels and logs. */
export function describeOperation(op: Operation): string {
  switch (op.type) {
    case "insert_content":
      return `Insert text (${op.content.text.length} chars)`;
    case "replace_content":
      return "Replace content";
    case "delete_content":
      return "Delete content";
    case "move_content":
      return `Move content ${op.destination.at}`;
    case "format_text":
      return `${op.mode} marks: ${op.marks.map((m) => m.type).join(", ")}`;
    case "set_block_type":
      return `Set block type → ${op.blockType}`;
    case "set_alignment":
      return `Align ${op.align}`;
    case "create_table":
      return `Create ${op.rows}×${op.cols} table`;
    case "modify_table":
      return `Table: ${op.operation.op}`;
    case "create_list":
      return `Create ${op.listKind} list (${op.items.length} items)`;
    case "transform_content":
      return `Transform: ${op.instruction}`;
    case "summarize":
      return `Summarize (${op.targetLength})`;
    case "undo":
      return `Undo ${op.steps} step(s)`;
    case "restore_version":
      return `Restore version ${op.versionId}`;
    case "reply":
      return "Reply";
    default: {
      // Exhaustiveness guard: adding an op without a case is a compile error.
      const _never: never = op;
      return _never;
    }
  }
}
