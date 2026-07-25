import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
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
  findWordRange,
  resolveInsertPosition,
  resolveTargetRange,
  type DocRange,
  type ResolveContext,
} from "./reference-resolver";
import {
  buildComparisonJSON,
  buildListJSON,
  buildTableJSON,
  contentSpecToJSON,
} from "./content-builder";
import { applyTableOp, readTableModel, tableModelToJSON } from "./table-model";
import { computeLineLayout, type LineLayout } from "./visual-lines";

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

// Block types that cannot hold a trailing cursor after them; dictation needs a
// following paragraph so the next utterance doesn't land inside the block.
const TRAILING_PARAGRAPH_AFTER = new Set(["table", "horizontalRule", "image"]);

// Normal document font size in points; relative sizing is computed from this
// (kept in sync with `.ProseMirror { font-size }` in globals.css).
const BASE_FONT_PT = 12;

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
    const index = buildIndex(this.editor.state.doc, this.version);
    const layout = this.lineLayout();

    // Remap each block's line/lineSpan to VISUAL lines measured from the DOM,
    // so the AI's "rigo N" matches the numbers shown in the gutter.
    const blocks = index.blocks.map((block) => {
      const start = layout.blockStart.get(block.blockId);
      if (start === undefined) return block;
      return { ...block, line: start, lineSpan: layout.blockSpan.get(block.blockId) ?? 1 };
    });

    return {
      snapshot: this.snapshot(),
      index: { ...index, blocks },
      selection: projectSelection(this.editor.state),
    };
  }

  /** Measure the visual-line layout from the rendered DOM (browser only). */
  private lineLayout(): LineLayout {
    try {
      return computeLineLayout(this.editor.view.dom as HTMLElement);
    } catch {
      return { numbers: [], blockStart: new Map(), blockSpan: new Map() };
    }
  }

  /** Resolve a target reference to the block id it points at (for annotations). */
  resolveBlockId(target: TargetRef): string | null {
    const doc = this.editor.state.doc;
    switch (target.kind) {
      case "block":
        return findBlockById(doc, target.blockId) ? target.blockId : null;
      case "line":
        return this.blockIdForVisualLine(target.line);
      case "word": {
        const blockId = target.line ? this.blockIdForVisualLine(target.line) : null;
        return findWordRange(doc, target.word, target.occurrence, blockId)?.blockId ?? null;
      }
      case "last":
        return this.lastBlockId;
      case "selection":
        return blockIdAt(doc, this.editor.state.selection.from);
      case "document":
        return null;
      default: {
        const _never: never = target;
        return _never;
      }
    }
  }

  /** The block that contains a given visual line number, if any. */
  private blockIdForVisualLine(line: number): string | null {
    const layout = this.lineLayout();
    for (const [blockId, start] of layout.blockStart) {
      const span = layout.blockSpan.get(blockId) ?? 1;
      if (line >= start && line < start + span) return blockId;
    }
    return null;
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

    // A new checkpoint is recorded only for *forward* edits. `undo` manages the
    // version/history itself via restoreSnapshot — checkpointing it would
    // corrupt the undo stack.
    const forwardEdit = applied.some((op) => op.type !== "undo");
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
    const doc = this.editor.state.doc;
    const last = doc.lastChild;
    // A document cannot end with a bare cursor "after" an atom block like a
    // table, so continued dictation would otherwise land INSIDE it. Ensure a
    // trailing paragraph to receive the next utterance.
    if (last && TRAILING_PARAGRAPH_AFTER.has(last.type.name)) {
      this.editor
        .chain()
        .insertContentAt(doc.content.size, { type: "paragraph" })
        .run();
    }
    this.editor.commands.setTextSelection(this.editor.state.doc.content.size);
  }

  /**
   * Ensure an empty, numbered blank line with enough reserved height sits right
   * after `blockId`, so a down-arrow anchored to that block doesn't overlap the
   * following text. Reuses/grows an existing blank line rather than stacking.
   */
  ensureArrowSpaceAfter(blockId: string, heightPx: number): void {
    const doc = this.editor.state.doc;
    const children: { node: PMNode; offset: number }[] = [];
    doc.forEach((node, offset) => children.push({ node, offset }));

    const idx = children.findIndex((c) => c.node.attrs.blockId === blockId);
    if (idx < 0) return;

    const block = children[idx]!;
    const next = children[idx + 1];
    const tr = this.editor.state.tr;

    if (next && next.node.type.name === "paragraph" && next.node.content.size === 0) {
      const current = (next.node.attrs.reservedSpace as number | null) ?? 0;
      if (current < heightPx) {
        tr.setNodeAttribute(next.offset, "reservedSpace", heightPx);
      } else {
        return; // already enough space
      }
    } else {
      const paragraph = this.editor.state.schema.nodes.paragraph!.create({
        reservedSpace: heightPx,
      });
      tr.insert(block.offset + block.node.nodeSize, paragraph);
    }
    this.editor.view.dispatch(tr);
  }

  /** Collapse all auto-reserved blank lines back to normal height. */
  clearReservedSpaces(): void {
    const tr = this.editor.state.tr;
    this.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && node.attrs.reservedSpace) {
        tr.setNodeAttribute(pos, "reservedSpace", null);
      }
    });
    if (tr.docChanged) this.editor.view.dispatch(tr);
  }

  /** True when the document is just one empty text block (never dictated into). */
  private isPristineEmpty(): boolean {
    const doc = this.editor.state.doc;
    const only = doc.firstChild;
    return doc.childCount === 1 && !!only && only.isTextblock && only.content.size === 0;
  }

  /**
   * Insert content, replacing the pristine empty paragraph on the very first
   * write so the document doesn't start with a stray empty "rigo 1".
   */
  private insertContent(pos: number, content: JSONContent | JSONContent[]): boolean {
    if (this.isPristineEmpty()) {
      return this.editor.commands.setContent(content, false);
    }
    return this.editor.chain().insertContentAt(pos, content).run();
  }

  /**
   * Append dictated text as a continuous flow. By default it CONTINUES the last
   * paragraph (so speech reads as prose, not one line per sentence). `newBlock`
   * starts a fresh paragraph and — per dictation convention ("a capo" ⇒ punto)
   * — first closes the previous sentence with a period.
   */
  private appendText(text: string, newBlock: boolean): boolean {
    if (this.isPristineEmpty()) {
      return this.editor.commands.setContent(contentSpecToJSON({ text }), false);
    }
    const last = this.editor.state.doc.lastChild;
    // Flow into the last paragraph — but never into a blank line reserved for an
    // arrow (that space belongs to the arrow), which starts a new paragraph.
    const canFlow =
      !newBlock &&
      !!last &&
      last.type.name === "paragraph" &&
      !last.attrs.reservedSpace;

    if (canFlow) {
      const existing = last!.textContent;
      const needsSpace =
        existing.length > 0 &&
        !/\s$/.test(existing) &&
        text.length > 0 &&
        !/^[\s.,;:!?)]/.test(text);
      // Just inside the last block's closing token → inline continuation.
      const at = this.editor.state.doc.content.size - 1;
      return this.insertUnmarkedText(at, (needsSpace ? " " : "") + text);
    }

    // Explicit break: finish the previous sentence before opening a new line.
    if (newBlock && last && last.type.name === "paragraph") {
      const t = last.textContent.trimEnd();
      if (t.length > 0 && !/[.!?…:;]$/.test(t)) {
        this.insertUnmarkedText(this.editor.state.doc.content.size - 1, ".");
      }
    }
    return this.editor
      .chain()
      .insertContentAt(this.editor.state.doc.content.size, contentSpecToJSON({ text }))
      .run();
  }

  /**
   * Append dictated text INTO a comparison column (by its blockId), flowing
   * within that column so it wraps inside the column's width instead of
   * spanning the page. Mirrors {@link appendText} but scoped to the column.
   */
  private appendToColumn(columnId: string, text: string, newBlock: boolean): boolean {
    const hit = findBlockById(this.editor.state.doc, columnId);
    if (!hit || hit.node.type.name !== "comparisonColumn") return false;

    const colEnd = hit.pos + hit.node.nodeSize;
    const lastChild = hit.node.lastChild;
    const canFlow =
      !newBlock &&
      !!lastChild &&
      lastChild.type.name === "paragraph" &&
      !lastChild.attrs.reservedSpace;

    if (canFlow) {
      const existing = lastChild!.textContent;
      const needsSpace =
        existing.length > 0 &&
        !/\s$/.test(existing) &&
        text.length > 0 &&
        !/^[\s.,;:!?)]/.test(text);
      // colEnd-2: just inside the last paragraph's close (colEnd-1 is the
      // column's own close token).
      return this.insertUnmarkedText(colEnd - 2, (needsSpace ? " " : "") + text);
    }

    // New line inside the column — close the previous sentence with a period.
    if (newBlock && lastChild && lastChild.type.name === "paragraph") {
      const t = lastChild.textContent.trimEnd();
      if (t.length > 0 && !/[.!?…:;]$/.test(t)) {
        this.insertUnmarkedText(colEnd - 2, ".");
      }
    }
    const after = findBlockById(this.editor.state.doc, columnId);
    if (!after) return false;
    const insertAt = after.pos + after.node.nodeSize - 1;
    return this.editor
      .chain()
      .insertContentAt(insertAt, contentSpecToJSON({ text }))
      .run();
  }

  /**
   * Insert inline text and strip any marks it inherited from the boundary, so a
   * flowing continuation (or an auto-inserted period) is plain and never picks
   * up the colour/highlight of the preceding word.
   */
  private insertUnmarkedText(at: number, text: string): boolean {
    if (text.length === 0) return true;
    const ok = this.editor.chain().insertContentAt(at, text).run();
    if (!ok) return false;
    return this.editor
      .chain()
      .setTextSelection({ from: at, to: at + text.length })
      .unsetAllMarks()
      .setTextSelection(at + text.length)
      .run();
  }

  /**
   * Reserve horizontal room beside a word for a left/right arrow, so the arrow
   * sits in real space instead of on top of the neighbouring words. Uses
   * non-breaking spaces (regular spaces would collapse and leave no margin).
   */
  ensureArrowSideSpace(
    blockId: string,
    word: string,
    occurrence: number,
    direction: "left" | "right",
    spaces: number,
  ): void {
    const range = findWordRange(this.editor.state.doc, word, occurrence, blockId);
    if (!range) return;
    const pad = " ".repeat(spaces);
    const at = direction === "right" ? range.to : range.from;
    this.editor.chain().insertContentAt(at, pad).run();
  }

  /** Undo the last `steps` conversational turns (semantic undo). */
  undo(steps = 1): Result<number> {
    const restore = this.checkpoints.undo(steps);
    if (!restore) return err(appError("internal", "Nothing to undo."));
    this.restoreSnapshot(restore);
    return ok(steps);
  }

  /** Replace the whole document with a snapshot (undo). */
  restoreSnapshot(snapshot: DocumentSnapshot): void {
    this.editor.commands.setContent(snapshot.content as JSONContent, false);
    this.title = snapshot.title;
    this.version = snapshot.docVersion;
  }

  /** Erase the whole document and reset history — a fresh, blank page. */
  clearDocument(): void {
    this.editor.commands.clearContent(true);
    this.version = 0;
    this.lastBlockId = null;
    this.checkpoints.clear();
  }

  /* ── Per-operation application ──────────────────────────────────────── */

  private context(): ResolveContext {
    const { from, to } = this.editor.state.selection;
    return { selection: { from, to }, lastBlockId: this.lastBlockId };
  }

  /** Translate a visual-line position ("beforeLine 4") to a block position. */
  private toBlockPosition(position: Position): Result<Position> {
    if (position.at !== "beforeLine" && position.at !== "afterLine") {
      return ok(position);
    }
    const blockId = this.blockIdForVisualLine(position.line);
    if (!blockId) {
      return err(appError("reference", `Il rigo ${position.line} non esiste.`));
    }
    return ok({
      at: position.at === "beforeLine" ? "before" : "after",
      blockId,
    });
  }

  /** Resolve an insertion position, translating visual-line positions first. */
  private resolveInsertPos(position: Position): Result<number> {
    const translated = this.toBlockPosition(position);
    if (!translated.ok) return translated;
    return resolveInsertPosition(
      this.editor.state.doc,
      translated.value,
      this.context(),
    );
  }

  private applyOne(op: Operation): Result<string> {
    const label = describeOperation(op);

    switch (op.type) {
      case "insert_content": {
        // Content aimed at a comparison column flows INSIDE that column.
        if (op.position.at === "inColumn") {
          if (
            !this.appendToColumn(
              op.position.columnId,
              op.content.text,
              op.content.newBlock === true,
            )
          ) {
            return err(appError("reference", "La colonna non è stata trovata."));
          }
          this.lastBlockId = op.position.columnId;
          return ok(label);
        }
        // Plain text added at the end of the document FLOWS by default —
        // continuing the current paragraph — so dictation reads as prose. A
        // new line happens only on an explicit break (content.newBlock).
        const flows =
          op.content.as === undefined &&
          !op.content.text.includes("\n\n") &&
          (op.position.at === "documentEnd" || op.position.at === "cursor");
        if (flows) {
          if (!this.appendText(op.content.text, op.content.newBlock === true)) {
            return err(appError("internal", "Insert failed."));
          }
          this.trackLastChild();
          return ok(label);
        }
        const pos = this.resolveInsertPos(op.position);
        if (!pos.ok) return pos;
        const content = contentSpecToJSON(op.content);
        if (!this.insertContent(pos.value, content)) {
          return err(appError("internal", "Insert failed."));
        }
        this.trackLastBlockAt(pos.value);
        return ok(label);
      }

      case "replace_content": {
        const range = this.resolveEditRange(op.target);
        if (!range.ok) return range;
        // Replacing a single word is an INLINE edit → insert plain text, not a
        // paragraph block (which would split the line).
        const content =
          op.target.kind === "word"
            ? op.content.text
            : contentSpecToJSON(op.content);
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

      case "set_font_size": {
        const range = this.resolveEditRange(op.target);
        if (!range.ok) return range;
        const chain = this.editor
          .chain()
          .setTextSelection({ from: range.value.from, to: range.value.to });
        if (op.size.mode === "reset") {
          chain.unsetFontSize();
        } else {
          const pt =
            op.size.mode === "absolute"
              ? op.size.points
              : Math.max(6, BASE_FONT_PT + op.size.deltaPoints);
          chain.setFontSize(`${pt}pt`);
        }
        chain.run();
        return ok(label);
      }

      case "create_table": {
        const pos = this.resolveInsertPos(op.position);
        if (!pos.ok) return pos;
        this.insertContent(pos.value, buildTableJSON(op));
        this.trackLastBlockAt(pos.value);
        return ok(label);
      }

      case "create_list": {
        const pos = this.resolveInsertPos(op.position);
        if (!pos.ok) return pos;
        this.insertContent(pos.value, buildListJSON(op));
        this.trackLastBlockAt(pos.value);
        return ok(label);
      }

      case "create_comparison": {
        const pos = this.resolveInsertPos(op.position);
        if (!pos.ok) return pos;
        this.insertContent(pos.value, buildComparisonJSON(op));
        this.trackLastBlockAt(pos.value);
        return ok(label);
      }

      case "modify_table":
        return this.applyModifyTable(op.tableId, op);

      case "undo": {
        const res = this.undo(op.steps);
        return res.ok ? ok(label) : res;
      }

      case "clear_document":
        // A full reset is handled by the pipeline (content + annotations).
        return err(appError("unsupported", "Clear is handled by the pipeline."));

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

      case "export_document":
        // Export is a client action handled by the pipeline, not a mutation.
        return err(appError("unsupported", "Export is handled by the pipeline."));

      case "annotate":
      case "clear_annotations":
        // Annotations are an overlay handled by the pipeline, not a doc edit.
        return err(appError("unsupported", "Annotations are handled by the pipeline."));

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

    // A visual "rigo N" is resolved against the measured layout to the block
    // that contains that line; block editing is reliable, sub-line is not.
    if (target.kind === "line") {
      const blockId = this.blockIdForVisualLine(target.line);
      if (!blockId) {
        return err(appError("reference", `Il rigo ${target.line} non esiste.`));
      }
      return resolveTargetRange(doc, { kind: "block", blockId }, ctx);
    }

    // A word constrained to a visual line: map the line to its block, then find
    // the word inside it (so "la parola osso al rigo 2" hits the right one).
    if (target.kind === "word" && target.line !== undefined) {
      const blockId = this.blockIdForVisualLine(target.line);
      const range = blockId
        ? findWordRange(doc, target.word, target.occurrence, blockId)
        : null;
      return range
        ? ok(range)
        : err(appError("reference", `La parola "${target.word}" non è stata trovata.`));
    }

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

    // Translate a visual-line destination to a stable block reference BEFORE
    // deleting, since deletion shifts the line numbering.
    const destRef = this.toBlockPosition(destination);
    if (!destRef.ok) return destRef;

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
      destRef.value,
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

  /** Remember the document's last top-level block as the `@last` target. */
  private trackLastChild(): void {
    const last = this.editor.state.doc.lastChild;
    const id =
      last && typeof last.attrs.blockId === "string" ? last.attrs.blockId : null;
    if (id) this.lastBlockId = id;
  }
}
