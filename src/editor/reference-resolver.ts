import type { Node as PMNode } from "@tiptap/pm/model";
import { type Result, appError, err, ok } from "@/lib/result";
import type { Position, TargetRef } from "@/core/operations";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Reference resolver
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Turns the AI's symbolic references — a `blockId`, `@selection`, `@last`,
 * `@document`, or an insertion `Position` — into concrete ProseMirror document
 * ranges/positions. This is the physical grounding of "that", "this part",
 * "above". Pure over the document; the live selection is passed in by the
 * Editor Controller (which owns the editor).
 */

export interface DocRange {
  readonly from: number;
  readonly to: number;
  /** The block this range corresponds to, when it is a single block. */
  readonly blockId: string | null;
}

export interface LiveSelection {
  readonly from: number;
  readonly to: number;
}

export interface ResolveContext {
  readonly selection: LiveSelection;
  readonly lastBlockId: string | null;
}

/** Locate a block by its stable id. Returns the node and its start position. */
export function findBlockById(
  doc: PMNode,
  blockId: string,
): { node: PMNode; pos: number } | null {
  let result: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (result) return false;
    if (node.attrs?.blockId === blockId) {
      result = { node, pos };
      return false;
    }
    return true;
  });
  return result;
}

/**
 * Locate a top-level block by its 1-based line number. Line numbering is the
 * position among the document's direct children — identical to the gutter and
 * the projected index.
 */
export function findBlockByLine(
  doc: PMNode,
  line: number,
): { node: PMNode; pos: number } | null {
  let result: { node: PMNode; pos: number } | null = null;
  doc.forEach((node, offset, index) => {
    if (index === line - 1) result = { node, pos: offset };
  });
  return result;
}

function blockRange(doc: PMNode, blockId: string): Result<DocRange> {
  const hit = findBlockById(doc, blockId);
  if (!hit) {
    return err(appError("reference", `Block ${blockId} was not found.`));
  }
  return ok({
    from: hit.pos,
    to: hit.pos + hit.node.nodeSize,
    blockId,
  });
}

/**
 * Locate the range of a word within a text block. Positions map linearly for
 * text blocks (paragraph/heading), where each character is one position after
 * the block's opening token. `blockId` narrows the search to one block;
 * otherwise the first block containing the word is used.
 */
export function findWordRange(
  doc: PMNode,
  word: string,
  occurrence: number,
  blockId: string | null,
): DocRange | null {
  const needle = word.toLowerCase();
  if (needle.length === 0) return null;
  // Defensive: never let a missing/invalid occurrence corrupt the position.
  const times = Number.isInteger(occurrence) && occurrence >= 1 ? occurrence : 1;

  const searchIn = (node: PMNode, blockStart: number): DocRange | null => {
    if (!node.isTextblock) return null;
    const haystack = node.textContent.toLowerCase();
    let index = -1;
    for (let n = 0; n < times; n++) {
      index = haystack.indexOf(needle, index + 1);
      if (index < 0) return null;
    }
    const from = blockStart + 1 + index; // +1: inside the block's opening token
    return {
      from,
      to: from + word.length,
      blockId: typeof node.attrs.blockId === "string" ? node.attrs.blockId : null,
    };
  };

  if (blockId) {
    const hit = findBlockById(doc, blockId);
    return hit ? searchIn(hit.node, hit.pos) : null;
  }

  let result: DocRange | null = null;
  doc.forEach((node, offset) => {
    if (result) return;
    result = searchIn(node, offset);
  });
  return result;
}

function lineRange(doc: PMNode, line: number): Result<DocRange> {
  const hit = findBlockByLine(doc, line);
  if (!hit) return err(appError("reference", `Line ${line} does not exist.`));
  const blockId =
    typeof hit.node.attrs.blockId === "string" ? hit.node.attrs.blockId : null;
  return ok({ from: hit.pos, to: hit.pos + hit.node.nodeSize, blockId });
}

/** Resolve a {@link TargetRef} to a concrete document range. */
export function resolveTargetRange(
  doc: PMNode,
  ref: TargetRef,
  ctx: ResolveContext,
): Result<DocRange> {
  switch (ref.kind) {
    case "document":
      return ok({ from: 0, to: doc.content.size, blockId: null });
    case "block":
      return blockRange(doc, ref.blockId);
    case "line":
      return lineRange(doc, ref.line);
    case "word": {
      // A word without a line is resolvable purely; with a line, the controller
      // translates it first (it owns the visual-line map).
      const range = findWordRange(doc, ref.word, ref.occurrence, null);
      return range
        ? ok(range)
        : err(appError("reference", `La parola "${ref.word}" non è stata trovata.`));
    }
    case "last":
      if (!ctx.lastBlockId) {
        return err(appError("reference", "There is no recent block to target."));
      }
      return blockRange(doc, ctx.lastBlockId);
    case "selection":
      if (ctx.selection.from === ctx.selection.to) {
        // Collapsed cursor: fall back to the block the cursor sits in.
        return err(
          appError(
            "reference",
            "Nothing is selected; resolve against the cursor block instead.",
          ),
        );
      }
      return ok({
        from: ctx.selection.from,
        to: ctx.selection.to,
        blockId: null,
      });
    default: {
      const _never: never = ref;
      return _never;
    }
  }
}

/** Resolve a {@link Position} to a single insertion position in the document. */
export function resolveInsertPosition(
  doc: PMNode,
  position: Position,
  ctx: ResolveContext,
): Result<number> {
  switch (position.at) {
    case "cursor":
      return ok(ctx.selection.to);
    case "documentStart":
      return ok(0);
    case "documentEnd":
      return ok(doc.content.size);
    case "before": {
      const hit = findBlockById(doc, position.blockId);
      if (!hit) {
        return err(appError("reference", `Block ${position.blockId} not found.`));
      }
      return ok(hit.pos);
    }
    case "after": {
      const hit = findBlockById(doc, position.blockId);
      if (!hit) {
        return err(appError("reference", `Block ${position.blockId} not found.`));
      }
      return ok(hit.pos + hit.node.nodeSize);
    }
    case "beforeLine": {
      const hit = findBlockByLine(doc, position.line);
      if (!hit) return err(appError("reference", `Line ${position.line} not found.`));
      return ok(hit.pos);
    }
    case "afterLine": {
      const hit = findBlockByLine(doc, position.line);
      if (!hit) return err(appError("reference", `Line ${position.line} not found.`));
      return ok(hit.pos + hit.node.nodeSize);
    }
    default: {
      const _never: never = position;
      return _never;
    }
  }
}
