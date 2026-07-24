import type { DocumentState } from "@/core/document/types";
import type { ConversationManager } from "@/core/conversation/conversation-manager";
import type { ReasoningInput } from "@/core/ai/reasoning-engine";
import { DEFAULT_CONTEXT_BUDGET, type ContextBudget } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Context Manager
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Assembles the exact context handed to the reasoning engine for one turn:
 * the document outline, the selection, and a budgeted slice of conversation
 * history. This is the single place where cost/latency trade-offs live — and
 * the natural home for future retrieval (RAG) over very long documents.
 */
export class ContextManager {
  constructor(private readonly budget: ContextBudget = DEFAULT_CONTEXT_BUDGET) {}

  /**
   * Build the reasoning input for a new utterance.
   *
   * For now the whole (budgeted) outline is included. When documents grow past
   * the block budget, this method is where we will swap to retrieving only the
   * blocks relevant to the utterance (semantic search over the index).
   */
  build(params: {
    utterance: string;
    documentState: DocumentState;
    conversation: ConversationManager;
  }): ReasoningInput {
    const { utterance, documentState, conversation } = params;

    const index =
      documentState.index.blocks.length > this.budget.maxBlocks
        ? {
            ...documentState.index,
            blocks: documentState.index.blocks.slice(0, this.budget.maxBlocks),
          }
        : documentState.index;

    return {
      utterance,
      index,
      selection: documentState.selection,
      history: conversation.toModelMessages(this.budget.maxHistoryTurns),
    };
  }
}
