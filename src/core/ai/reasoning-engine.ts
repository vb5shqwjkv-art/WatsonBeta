import { logger } from "@/lib/logger";
import type { AppError } from "@/lib/result";
import type {
  DocumentIndex,
  SelectionState,
} from "@/core/document/types";
import { parseOperation } from "@/core/operations";
import type { Operation } from "@/core/operations";
import { buildOperationTools, toOperationPayload } from "./tools";
import { SYSTEM_PROMPT, renderDocumentContext } from "./system-prompt";
import type {
  ModelMessage,
  ReasoningProvider,
  TokenUsage,
} from "./providers/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * AI Reasoning Engine
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Turns one user utterance + the live document context into a validated list
 * of {@link Operation}s (or a conversational reply). Provider-agnostic: the
 * concrete LLM is injected, so the engine is unit-testable with a fake.
 *
 * Robustness:
 * - Every tool call is validated against the Operation schema; invalid calls
 *   are never applied.
 * - A bounded *repair* loop re-prompts the model with the validation errors so
 *   a malformed call is corrected rather than silently dropped.
 * - The outcome reports `basedOnVersion` so the Editor Controller can detect a
 *   document that changed under the engine (optimistic concurrency).
 */

export interface ReasoningInput {
  /** The newly transcribed utterance to interpret. */
  readonly utterance: string;
  /** Live projected outline of the document (possibly a cursor-centered window). */
  readonly index: DocumentIndex;
  /** Current selection/cursor state. */
  readonly selection: SelectionState;
  /** Blocks omitted before/after the window, so the model knows they exist. */
  readonly hiddenBefore?: number;
  readonly hiddenAfter?: number;
  /**
   * Recent conversation turns (already trimmed/budgeted by the Context
   * Manager), oldest first, excluding the new utterance.
   */
  readonly history: readonly ModelMessage[];
}

/** A tool call that failed domain validation, retained for observability. */
export interface RejectedToolCall {
  readonly name: string;
  readonly error: AppError;
}

export interface ReasoningOutcome {
  /** Validated operations to execute, in order. */
  readonly operations: readonly Operation[];
  /** A conversational reply, when the model chose to talk instead of edit. */
  readonly reply: string | null;
  /** Tool calls that were emitted but failed validation (after repair). */
  readonly rejected: readonly RejectedToolCall[];
  /** The document version the reasoning was based on (optimistic concurrency). */
  readonly basedOnVersion: number;
  /** Aggregate token usage across the turn (including any repair attempts). */
  readonly usage: TokenUsage | null;
}

export interface ReasoningEngineOptions {
  readonly temperature?: number;
  /** Max corrective re-prompts when a tool call fails validation. */
  readonly maxRepairAttempts?: number;
}

interface ParsedCalls {
  readonly operations: Operation[];
  readonly rejected: RejectedToolCall[];
  readonly message: string | null;
  readonly usage: TokenUsage | null;
}

export class ReasoningEngine {
  private readonly tools = buildOperationTools();
  private readonly maxRepairAttempts: number;

  constructor(
    private readonly provider: ReasoningProvider,
    private readonly options: ReasoningEngineOptions = {},
  ) {
    this.maxRepairAttempts = options.maxRepairAttempts ?? 1;
  }

  async run(input: ReasoningInput): Promise<ReasoningOutcome> {
    const log = logger.child({ module: "reasoning-engine" });
    const context = renderDocumentContext(input.index, input.selection, {
      hiddenBefore: input.hiddenBefore,
      hiddenAfter: input.hiddenAfter,
    });
    const userTurn: ModelMessage = {
      role: "user",
      content: `${context}\n\n---\nThe user just said:\n"${input.utterance}"`,
    };

    log.debug("running reasoning turn", {
      utteranceLength: input.utterance.length,
      blocks: input.index.blocks.length,
      historyTurns: input.history.length,
    });

    let messages: ModelMessage[] = [...input.history, userTurn];
    let usage: TokenUsage | null = null;
    let parsed = await this.complete(messages);
    usage = mergeUsage(usage, parsed.usage);

    // Bounded repair loop: re-prompt with the validation errors.
    let attempt = 0;
    while (parsed.rejected.length > 0 && attempt < this.maxRepairAttempts) {
      attempt++;
      log.warn("repairing invalid tool calls", {
        attempt,
        rejected: parsed.rejected.map((r) => r.name),
      });
      messages = [...messages, ...this.repairMessages(parsed)];
      parsed = await this.complete(messages);
      usage = mergeUsage(usage, parsed.usage);
    }

    // A `reply` operation and a free-text message are both "talk to the user".
    const replyOp = parsed.operations.find((op) => op.type === "reply");
    const reply =
      replyOp && replyOp.type === "reply" ? replyOp.message : parsed.message;

    return {
      operations: parsed.operations.filter((op) => op.type !== "reply"),
      reply: reply ?? null,
      rejected: parsed.rejected,
      basedOnVersion: input.index.docVersion,
      usage,
    };
  }

  private async complete(messages: ModelMessage[]): Promise<ParsedCalls> {
    const result = await this.provider.complete({
      system: SYSTEM_PROMPT,
      messages,
      tools: this.tools,
      toolChoice: "auto",
      temperature: this.options.temperature ?? 0.2,
    });

    const operations: Operation[] = [];
    const rejected: RejectedToolCall[] = [];
    for (const call of result.toolCalls) {
      const payload = toOperationPayload(call.name, call.arguments);
      const validated = parseOperation(payload);
      if (validated.ok) operations.push(validated.value);
      else rejected.push({ name: call.name, error: validated.error });
    }

    return {
      operations,
      rejected,
      message: result.message,
      usage: result.usage,
    };
  }

  /** Build the corrective turn that tells the model exactly what was invalid. */
  private repairMessages(parsed: ParsedCalls): ModelMessage[] {
    const problems = parsed.rejected
      .map((r) => `- ${r.name}: ${r.error.message}`)
      .join("\n");
    return [
      {
        role: "assistant",
        content: "(some of my previous tool calls were malformed)",
      },
      {
        role: "user",
        content: `The following tool calls failed validation:\n${problems}\n\nRe-issue ALL the operations you intended as valid tool calls. Do not repeat the invalid arguments.`,
      },
    ];
  }
}

function mergeUsage(
  a: TokenUsage | null,
  b: TokenUsage | null,
): TokenUsage | null {
  if (!a) return b;
  if (!b) return a;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
