/** Context-assembly configuration. */

export interface ContextBudget {
  /** Max number of indexed blocks to include in the outline. */
  readonly maxBlocks: number;
  /** Max number of prior conversation turns to include. */
  readonly maxHistoryTurns: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxBlocks: 200,
  maxHistoryTurns: 20,
};
