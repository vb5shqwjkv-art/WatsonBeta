import type {
  DocumentIndex,
  DocumentState,
  SelectionState,
} from "@/core/document/types";
import { blockPosition } from "@/core/document/document-index";
import { focusedBlockId } from "@/core/document/selection";
import type { ConversationManager } from "@/core/conversation/conversation-manager";
import type { ReasoningInput } from "@/core/ai/reasoning-engine";
import { DEFAULT_CONTEXT_BUDGET, type ContextBudget } from "./types";

/** A budgeted slice of the outline plus the counts of what was omitted. */
export interface OutlineSelection {
  readonly index: DocumentIndex;
  readonly hiddenBefore: number;
  readonly hiddenAfter: number;
}

/**
 * Select a contiguous window of blocks around the user's focus (selection or
 * cursor), so that for very long documents we send the *relevant* region — not
 * a blind prefix that would drop the very part being edited. Returns the whole
 * outline when it already fits the budget.
 *
 * This is the seam where semantic retrieval (RAG) will later replace the
 * positional window for documents that don't fit contiguously.
 */
export function selectContextBlocks(
  index: DocumentIndex,
  selection: SelectionState,
  maxBlocks: number,
): OutlineSelection {
  const n = index.blocks.length;
  if (n <= maxBlocks) {
    return { index, hiddenBefore: 0, hiddenAfter: 0 };
  }

  const focusId = focusedBlockId(selection);
  const focus = focusId ? blockPosition(index, focusId) : -1;
  // Default the focus to the document end, where dictation appends.
  const anchor = focus >= 0 ? focus : n - 1;

  const half = Math.floor(maxBlocks / 2);
  const start = Math.min(Math.max(anchor - half, 0), n - maxBlocks);
  const end = start + maxBlocks;

  return {
    index: { ...index, blocks: index.blocks.slice(start, end) },
    hiddenBefore: start,
    hiddenAfter: n - end,
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Context Manager
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Assembles the exact context handed to the reasoning engine for one turn: a
 * budgeted, cursor-centered outline, the selection, and a trimmed slice of
 * conversation history. This is the single place where cost/latency trade-offs
 * live — and the natural home for future retrieval over long documents.
 */
export class ContextManager {
  constructor(private readonly budget: ContextBudget = DEFAULT_CONTEXT_BUDGET) {}

  build(params: {
    utterance: string;
    documentState: DocumentState;
    conversation: ConversationManager;
  }): ReasoningInput {
    const { utterance, documentState, conversation } = params;

    const window = selectContextBlocks(
      documentState.index,
      documentState.selection,
      this.budget.maxBlocks,
    );

    return {
      utterance,
      index: window.index,
      selection: documentState.selection,
      hiddenBefore: window.hiddenBefore,
      hiddenAfter: window.hiddenAfter,
      history: conversation.toModelMessages(this.budget.maxHistoryTurns),
    };
  }
}
