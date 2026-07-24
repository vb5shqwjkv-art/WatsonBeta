import type { Editor, JSONContent } from "@tiptap/core";
import { type AppError, type Result, appError, err, ok } from "@/lib/result";
import { logger } from "@/lib/logger";
import type { JsonValue } from "@/lib/json";
import {
  MarkType,
  type DocumentSnapshot,
  type DocumentState,
} from "@/core/document/types";
import {
  describeOperation,
  isMutating,
  type MarkSpec,
  type Operation,
  type Position,
  type TargetRef,
} from "@/core/operations";
import type { CheckpointStack } from "@/core/document/versioning";
import { buildIndex } from "./document-indexer";
import { blockIdAt, projectSelection } from "./selection-projector";
import {
  findBlockById,
  resolveInsertPosition,
  resolveTargetRange,
  type DocRange,
  type ResolveContext,
} from "./reference-resolver";
import {
  buildListJSON,
  buildTableJSON,
  contentSpecToJSON,
} from "./content-builder";
import { applyTableOp, readTableModel, tableModelToJSON } from "./table-model";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Editor Controller — the single actuator
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The ONLY component allowed to mutate the document programmatically. The AI
 * never touches the editor; it emits validated {@link Operation}s and this
 * controller turns each into a Tiptap transaction. It also:
 *   - projects the live editor into the {@link DocumentState} the AI reads,
 *   - enforces optimistic concurrency (a turn built against a stale version is
 *     rejected, not silently misapplied),
 *   - records one semantic checkpoint per mutating turn for "go back".
 */

export interface AppliedFailure {
  readonly op: Operation;
  readonly error: AppError;
}

export interface TurnResult {
  readonly applied: Operation[];
  readonly failed: AppliedFailure[];
  readonly summary: string[];
  /** True when the turn was rejected because the document version drifted. */
  readonly conflict: boolean;
}

export interface EditorControllerOptions {
  readonly documentId: string;
  readonly title?: string;
}

// Toggle-style marks handled uniformly via setMark/unsetMark/toggleMark.
// Color is a TextStyle attribute (setColor) and is handled separately.
const MARK_NAME: Partial<Record<MarkType, string>> = {
  [MarkType.Bold]: "bold",
  [MarkType.Italic]: "italic",
  [MarkType.Underline]: "underline",
  [MarkType.Strike]: "strike",
  [MarkType.Code]: "code",
  [MarkType.Highlight]: "highlight",
  [MarkType.Link]: "link",
};

function markAttrs(mark: MarkSpec): Record<string, unknown> {
  if (mark.type === MarkType.Link) return { href: mark.href };
  if (mark.type === MarkType.Highlight && mark.color) return { color: mark.color };
  return {};
}

export class EditorController {
  private version = 0;
  private title: string;
  private lastBlockId: string | null = null;
  private readonly log = logger.child({ module: "editor-controller" });

  constructor(
    private readonly editor: Editor,
    private readonly checkpoints: CheckpointStack,
    private readonly options: EditorControllerOptions,
  ) {
    this.title = options.title ?? "Untitled";
  }

  /* ── Projection (what the AI reads) ─────────────────────────────────── */

  get currentVersion(): number {
    return this.version;
  }

  setTitle(title: string): void {
    this.title = title;
  }

  snapshot(): DocumentSnapshot {
    return {
      documentId: this.options.documentId,
      title: this.title,
      content: this.editor.getJSON() as JsonValue,
      docVersion: this.version,
      updatedAt: new Date().toISOString(),
    };
  }

  documentState(): DocumentState {
    return {
      snapshot: this.snapshot(),
      index: buildIndex(this.editor.state.doc, this.version),
      selection: projectSelection(this.editor.state),
    };
  }

  /**
   * Plain text of a target range. Used by the pipeline to resolve generative
   * operations (transform/summarize): the client extracts the target text, has
   * it rewritten by a focused server call, then applies a `replace_content`.
   */
  getTargetText(target: TargetRef): Result<string> {
    const range = this.resolveEditRange(target);
    if (!range.ok) return range;
    const text = this.editor.state.doc.textBetween(
      range.value.from,
      range.value.to,
      "\n",
      " ",
    );
    return ok(text);
  }

  /* ── Applying a turn ────────────────────────────────────────────────── */

  /**
   * Apply an ordered list of operations as a single conversational turn.
   * `expectedVersion` (the engine's `basedOnVersion`) guards against acting on
   * a document that changed since the AI reasoned about it.
   */
  applyTurn(
    operations: readonly Operation[],
    turnId: string,
    opts: { expectedVersion?: number } = {},
  ): TurnResult {
    if (
      opts.expectedVersion !== undefined &&
      opts.expectedVersion !== this.version
    ) {
      this.log.warn("turn rejected: version conflict", {
        expected: opts.expectedVersion,
        actual: this.version,
      });
      return {
        applied: [],
        failed: operations.map((op) => ({
          op,
          error: appError("conflict", "Document changed since this turn was planned."),
        })),
        summary: [],
        conflict: true,
      };
    }

    const before = this.snapshot();
    const applied: Operation[] = [];
    const failed: AppliedFailure[] = [];
    const summary: string[] = [];

    for (const op of operations) {
      if (!isMutating(op)) continue; // reply never reaches the controller
      const result = this.applyOne(op);
      if (result.ok) {
        applied.push(op);
        summary.push(result.value);
      } else {
        failed.push({ op, error: result.error });
        this.log.warn("operation failed", {
          type: op.type,
          error: result.error.message,
        });
      }
    }

    // A new checkpoint is recorded only for *forward* edits. Meta ops (undo,
    // restore_version) manage the version/history themselves via
    // restoreSnapshot — checkpointing them would corrupt the undo stack.
    const forwardEdit = applied.some(
      (op) => op.type !== "undo" && op.type !== "restore_version",
    );
    if (forwardEdit) {
      this.version += 1;
      this.checkpoints.push({
        turnId,
        label: summary.join("; ") || "edit",
        snapshotBefore: before,
      });
    }

    // Park the cursor at the end so the next dictation appends there. In
    // dictation mode the editor is not user-editable, so without this the
    // implicit "cursor" would stay at position 0 and text would prepend.
    if (applied.length > 0) this.parkCursorAtEnd();

    return { applied, failed, summary, conflict: false };
  }

  /** Move the selection to the end of the document (dictation append point). */
  parkCursorAtEnd(): void {
    const end = this.editor.state.doc.content.size;
    this.editor.commands.setTextSelection(end);
  }

  /** Undo the last `steps` conversational turns (semantic undo). */
  undo(steps = 1): Result<number> {
    const restore = this.checkpoints.undo(steps);
    if (!restore) return err(appError("internal", "Nothing to undo."));
    this.restoreSnapshot(restore);
    return ok(steps);
  }

  /** Replace the whole document with a snapshot (undo / version restore). */
  restoreSnapshot(snapshot: DocumentSnapshot): void {
    this.editor.commands.setContent(snapshot.content as JSONContent, false);
    this.title = snapshot.title;
    this.version = snapshot.docVersion;
  }

  /* ── Per-operation application ──────────────────────────────────────── */

  private context(): ResolveContext {
    const { from, to } = this.editor.state.selection;
    return { selection: { from, to }, lastBlockId: this.lastBlockId };
  }

  private applyOne(op: Operation): Result<string> {
    const doc = this.editor.state.doc;
    const ctx = this.context();
    const label = describeOperation(op);

    switch (op.type) {
      case "insert_content": {
        const pos = resolveInsertPosition(doc, op.position, ctx);
        if (!pos.ok) return pos;
        const content = contentSpecToJSON(op.content);
        if (!this.editor.chain().insertContentAt(pos.value, content).run()) {
          return err(appError("internal", "Insert failed."));
        }
        this.trackLastBlockAt(pos.value);
        return ok(label);
      }

      case "replace_content": {
        const range = this.resolveEditRange(op.target);
        if (!range.ok) return range;
        const content = contentSpecToJSON(op.content);
        if (
          !this.editor
            .chain()
            .insertContentAt({ from: range.value.from, to: range.value.to }, content)
            .run()
        ) {
          return err(appError("internal", "Replace failed."));
        }
        this.trackLastBlockAt(range.value.from);
        return ok(label);
      }

      case "delete_content": {
        const range = this.resolveEditRange(op.target);
        if (!range.ok) return range;
        this.editor
          .chain()
          .deleteRange({ from: range.value.from, to: range.value.to })
          .run();
        return ok(label);
      }

      case "move_content":
        return this.applyMove(op.target, op.destination);

      case "format_text": {
        const range = this.resolveEditRange(op.target);
        if (!range.ok) return range;
        const sel = { from: range.value.from, to: range.value.to };
        // Each mark is applied in its own chain/run: some commands (notably
        // Color's setColor) internally call run() on a sub-chain, which would
        // otherwise swallow the rest of a shared chain. Marks don't shift
        // positions, so the range stays valid across runs.
        for (const mark of op.marks) {
          const chain = this.editor.chain().setTextSelection(sel);
          if (mark.type === MarkType.Color) {
            if (op.mode === "remove") chain.unsetColor();
            else chain.setColor(mark.color);
          } else {
            const name = MARK_NAME[mark.type];
            if (!name) continue;
            if (op.mode === "remove") chain.unsetMark(name);
            else if (op.mode === "toggle") chain.toggleMark(name, markAttrs(mark));
            else chain.setMark(name, markAttrs(mark));
          }
          chain.run();
        }
        return ok(label);
      }

      case "set_block_type": {
        const range = this.resolveEditRange(op.target);
        if (!range.ok) return range;
        const chain = this.editor
          .chain()
          .setTextSelection({ from: range.value.from, to: range.value.to });
        switch (op.blockType) {
          case "heading":
            chain.setNode("heading", { level: op.level ?? 2 });
            break;
          case "paragraph":
            chain.setParagraph();
            break;
          case "codeBlock":
            chain.setNode("codeBlock");
            break;
          case "blockquote":
            chain.toggleWrap("blockquote");
            break;
          default:
            return err(
              appError("unsupported", `Cannot set block type to ${op.blockType}.`),
            );
        }
        chain.run();
        return ok(label);
      }

      case "set_alignment": {
        const range = this.resolveEditRange(op.target);
        if (!range.ok) return range;
        this.editor
          .chain()
          .setTextSelection({ from: range.value.from, to: range.value.to })
          .setTextAlign(op.align)
          .run();
        return ok(label);
      }

      case "create_table": {
        const pos = resolveInsertPosition(doc, op.position, ctx);
        if (!pos.ok) return pos;
        this.editor.chain().insertContentAt(pos.value, buildTableJSON(op)).run();
        this.trackLastBlockAt(pos.value);
        return ok(label);
      }

      case "create_list": {
        const pos = resolveInsertPosition(doc, op.position, ctx);
        if (!pos.ok) return pos;
        this.editor.chain().insertContentAt(pos.value, buildListJSON(op)).run();
        this.trackLastBlockAt(pos.value);
        return ok(label);
      }

      case "modify_table":
        return this.applyModifyTable(op.tableId, op);

      case "undo": {
        const res = this.undo(op.steps);
        return res.ok ? ok(label) : res;
      }

      case "restore_version":
        return err(
          appError("unsupported", "Version restore is wired in Phase 4 (storage)."),
        );

      case "transform_content":
      case "summarize":
        // Generative ops are resolved into a concrete replace_content by the
        // pipeline (a focused follow-up generation) before reaching here.
        return err(
          appError(
            "unsupported",
            `Generative op '${op.type}' must be resolved by the pipeline.`,
          ),
        );

      case "reply":
        // Replies are surfaced by the pipeline, never applied to the document.
        return err(appError("unsupported", "Reply is not a document operation."));

      default: {
        const _never: never = op;
        return _never;
      }
    }
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */

  /**
   * Resolve a target to an editable range, with the sensible fallback that a
   * collapsed "selection" means "the block the cursor is in".
   */
  private resolveEditRange(target: TargetRef): Result<DocRange> {
    const doc = this.editor.state.doc;
    const ctx = this.context();
    const direct = resolveTargetRange(doc, target, ctx);
    if (direct.ok) return direct;

    // Fallback: collapsed selection → the cursor's block.
    if (target.kind === "selection") {
      const id = blockIdAt(doc, ctx.selection.from);
      if (id) {
        const hit = findBlockById(doc, id);
        if (hit) {
          return ok<DocRange>({
            from: hit.pos,
            to: hit.pos + hit.node.nodeSize,
            blockId: id,
          });
        }
      }
    }
    return direct;
  }

  private applyMove(
    target: TargetRef,
    destination: Position,
  ): Result<string> {
    const doc = this.editor.state.doc;
    const range = this.resolveEditRange(target);
    if (!range.ok) return range;

    const slice = doc.slice(range.value.from, range.value.to);
    const content = slice.content.toJSON() as JSONContent[] | null;
    if (!content || content.length === 0) {
      return err(appError("unsupported", "Nothing to move."));
    }

    // Delete first, then resolve the destination against the updated document.
    this.editor
      .chain()
      .deleteRange({ from: range.value.from, to: range.value.to })
      .run();

    const dest = resolveInsertPosition(
      this.editor.state.doc,
      destination,
      this.context(),
    );
    if (!dest.ok) return dest;

    this.editor.chain().insertContentAt(dest.value, content).run();
    this.trackLastBlockAt(dest.value);
    return ok("Move content");
  }

  private applyModifyTable(
    tableId: string,
    op: Extract<Operation, { type: "modify_table" }>,
  ): Result<string> {
    const doc = this.editor.state.doc;
    const hit = findBlockById(doc, tableId);
    if (!hit || hit.node.type.name !== "table") {
      return err(appError("reference", `Table ${tableId} was not found.`));
    }

    const model = readTableModel(hit.node);
    const next = applyTableOp(model, op.operation);
    if (!next.ok) return next;

    const newJSON = tableModelToJSON(next.value);
    this.editor
      .chain()
      .insertContentAt(
        { from: hit.pos, to: hit.pos + hit.node.nodeSize },
        newJSON,
      )
      .run();
    return ok(describeOperation(op));
  }

  /** Best-effort: remember the block at a position as the `@last` target. */
  private trackLastBlockAt(pos: number): void {
    const size = this.editor.state.doc.content.size;
    // +1 lands inside the just-inserted block rather than on the boundary
    // between it and the previous block.
    const id = blockIdAt(this.editor.state.doc, Math.min(pos + 1, size));
    if (id) this.lastBlockId = id;
  }
}
