import { newTurnId } from "@/lib/ids";
import type { EditorController, TurnResult } from "@/editor/editor-controller";
import type {
  ConversationManager,
  TurnQueue,
} from "@/core/conversation/conversation-manager";
import type { ContextManager } from "@/core/context/context-manager";
import type { AnnotationManager } from "@/core/annotations/annotation-manager";
import { parseOperation, type Operation } from "@/core/operations";
import { requestReasoning, requestTextTransform } from "./ai-client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Dictation Pipeline
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The client-side orchestrator for one spoken utterance:
 *
 *   utterance
 *     → Conversation Manager (record)
 *     → Context Manager (build budgeted context)
 *     → /api/ai (reason → validated operations)
 *     → resolve generative ops into concrete text (/api/ai/transform)
 *     → Editor Controller (apply as one turn, instantly on the page)
 *
 * Turns are serialized through the {@link TurnQueue} so rapid speech never
 * interleaves document mutations.
 */

export interface DictationHooks {
  onProcessingChange?(processing: boolean): void;
  onApplied?(result: TurnResult): void;
  onExport?(format: "pdf" | "docx"): void;
  onAnnotationsChanged?(): void;
  onError?(message: string): void;
}

// The arrow is drawn at the anchor line's height, so it needs only a single
// ordinary blank line beneath it — never an inflated gap.
const ARROW_SIZE_HINT_PX = 22;
const ARROW_BLANK_LINE_PX = 26;
// Non-breaking spaces reserved beside a word for a left/right arrow, so it sits
// in real margin instead of on top of the neighbouring words.
const ARROW_SIDE_SPACES = 6;

export class DictationPipeline {
  constructor(
    private readonly controller: EditorController,
    private readonly conversation: ConversationManager,
    private readonly context: ContextManager,
    private readonly queue: TurnQueue,
    private readonly annotations: AnnotationManager,
    private readonly hooks: DictationHooks = {},
  ) {}

  /** Enqueue an utterance for ordered processing. */
  submit(utterance: string): Promise<void> {
    return this.queue.enqueue(() => this.process(utterance));
  }

  private async process(utterance: string): Promise<void> {
    this.hooks.onProcessingChange?.(true);
    try {
      this.conversation.addUserUtterance(utterance);

      const input = this.context.build({
        utterance,
        documentState: this.controller.documentState(),
        conversation: this.conversation,
      });

      const outcome = await requestReasoning({
        utterance,
        index: input.index,
        selection: input.selection,
        history: input.history,
        hiddenBefore: input.hiddenBefore,
        hiddenAfter: input.hiddenAfter,
      });

      // Client-side / overlay ops are handled here, not by the Editor Controller.
      let annotationsChanged = false;
      for (const op of outcome.operations) {
        if (op.type === "export_document") {
          this.hooks.onExport?.(op.format);
        } else if (op.type === "clear_document") {
          this.controller.clearDocument();
          this.annotations.removeAll();
          annotationsChanged = true;
        } else if (op.type === "annotate") {
          const blockId = this.controller.resolveBlockId(op.target);
          if (blockId) {
            this.annotations.add({
              kind: "arrow",
              blockId,
              word: op.word ?? "",
              occurrence: op.occurrence,
              direction: op.direction,
              color: op.color ?? "#1a1a1a",
              sizePx: ARROW_SIZE_HINT_PX,
            });
            // Reserve room so the arrow never overlaps the text: a blank line
            // below a down-arrow, or horizontal margin beside a side-arrow.
            if (op.direction === "down") {
              this.controller.ensureArrowSpaceAfter(blockId, ARROW_BLANK_LINE_PX);
            } else if (
              (op.direction === "left" || op.direction === "right") &&
              op.word
            ) {
              this.controller.ensureArrowSideSpace(
                blockId,
                op.word,
                op.occurrence,
                op.direction,
                ARROW_SIDE_SPACES,
              );
            }
            annotationsChanged = true;
          }
        } else if (op.type === "clear_annotations") {
          this.annotations.removeAll();
          this.controller.clearReservedSpaces();
          annotationsChanged = true;
        }
      }
      if (annotationsChanged) this.hooks.onAnnotationsChanged?.();

      const editable = outcome.operations.filter(
        (op) =>
          op.type !== "export_document" &&
          op.type !== "clear_document" &&
          op.type !== "annotate" &&
          op.type !== "clear_annotations",
      );

      const operations = await this.resolveGenerative(editable);
      const result = this.controller.applyTurn(operations, newTurnId(), {
        expectedVersion: outcome.basedOnVersion,
      });

      if (result.summary.length > 0) {
        this.conversation.addAssistantAction(result.summary.join("; "));
      }
      this.hooks.onApplied?.(result);
    } catch (error) {
      this.hooks.onError?.(
        error instanceof Error ? error.message : "Errore di elaborazione.",
      );
    } finally {
      this.hooks.onProcessingChange?.(false);
    }
  }

  /**
   * Replace generative operations with concrete `replace_content` by having the
   * target text rewritten server-side. The target text is read locally (the
   * browser owns the document), so only the relevant snippet is sent.
   */
  private async resolveGenerative(
    ops: readonly Operation[],
  ): Promise<Operation[]> {
    const out: Operation[] = [];
    for (const op of ops) {
      if (op.type !== "transform_content" && op.type !== "summarize") {
        out.push(op);
        continue;
      }

      const targetText = this.controller.getTargetText(op.target);
      if (!targetText.ok || targetText.value.trim().length === 0) continue;

      const text =
        op.type === "transform_content"
          ? await requestTextTransform({
              mode: "transform",
              text: targetText.value,
              instruction: op.instruction,
            })
          : await requestTextTransform({
              mode: "summarize",
              text: targetText.value,
              targetLength: op.targetLength,
            });

      if (text.trim().length === 0) continue;

      const replacement = parseOperation({
        type: "replace_content",
        target: op.target,
        content: { text },
      });
      if (replacement.ok) out.push(replacement.value);
    }
    return out;
  }
}
