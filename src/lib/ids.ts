import { customAlphabet } from "nanoid";

/**
 * Stable identifier generation.
 *
 * Every addressable entity in the system carries a short, prefixed, URL-safe
 * id. Prefixes make ids self-describing in logs, prompts, and the LLM tool
 * arguments (e.g. the model can reason about `blk_…` vs `tbl_…`).
 */

// A-Z, a-z, 0-9 without look-alike characters, lowercased for compactness.
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 10);

export const IdPrefix = {
  Block: "blk",
  Table: "tbl",
  List: "lst",
  Turn: "trn",
  Checkpoint: "ckpt",
  Version: "ver",
  Message: "msg",
  Document: "doc",
  Annotation: "ann",
} as const;

export type IdPrefix = (typeof IdPrefix)[keyof typeof IdPrefix];

/** Create a new prefixed id, e.g. `blk_3f9a2c8b10`. */
export function createId(prefix: IdPrefix): string {
  return `${prefix}_${nano()}`;
}

/** Convenience helpers for the most common id kinds. */
export const newBlockId = () => createId(IdPrefix.Block);
export const newTableId = () => createId(IdPrefix.Table);
export const newTurnId = () => createId(IdPrefix.Turn);
export const newCheckpointId = () => createId(IdPrefix.Checkpoint);
export const newVersionId = () => createId(IdPrefix.Version);
export const newMessageId = () => createId(IdPrefix.Message);
export const newDocumentId = () => createId(IdPrefix.Document);
export const newAnnotationId = () => createId(IdPrefix.Annotation);

/** Whether a string looks like an id of the given prefix. */
export function isId(value: string, prefix: IdPrefix): boolean {
  return value.startsWith(`${prefix}_`);
}
