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
 */

export interface ReasoningInput {
  /** The newly transcribed utterance to interpret. */
  readonly utterance: string;
  /** Live projected outline of the document. */
  readonly index: DocumentIndex;
  /** Current selection/cursor state. */
  readonly selection: SelectionState;
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
  /** Tool calls that were emitted but failed validation. */
  readonly rejected: readonly RejectedToolCall[];
  readonly usage: TokenUsage | null;
}

export interface ReasoningEngineOptions {
  readonly temperature?: number;
}

export class ReasoningEngine {
  private readonly tools = buildOperationTools();

  constructor(
    private readonly provider: ReasoningProvider,
    private readonly options: ReasoningEngineOptions = {},
  ) {}

  async run(input: ReasoningInput): Promise<ReasoningOutcome> {
    const context = renderDocumentContext(input.index, input.selection);
    const userTurn: ModelMessage = {
      role: "user",
      content: `${context}\n\n---\nThe user just said:\n"${input.utterance}"`,
    };

    const log = logger.child({ module: "reasoning-engine" });
    log.debug("running reasoning turn", {
      utteranceLength: input.utterance.length,
      blocks: input.index.blocks.length,
      historyTurns: input.history.length,
    });

    const result = await this.provider.complete({
      system: SYSTEM_PROMPT,
      messages: [...input.history, userTurn],
      tools: this.tools,
      toolChoice: "auto",
      temperature: this.options.temperature ?? 0.2,
    });

    const operations: Operation[] = [];
    const rejected: RejectedToolCall[] = [];

    for (const call of result.toolCalls) {
      const payload = toOperationPayload(call.name, call.arguments);
      const parsed = parseOperation(payload);
      if (parsed.ok) {
        operations.push(parsed.value);
      } else {
        rejected.push({ name: call.name, error: parsed.error });
        log.warn("rejected tool call", {
          name: call.name,
          error: parsed.error.message,
        });
      }
    }

    // A `reply` operation and a free-text message are both "talk to the user".
    // Normalize: surface a single reply string, preferring an explicit op.
    const replyOp = operations.find((op) => op.type === "reply");
    const reply =
      replyOp && replyOp.type === "reply"
        ? replyOp.message
        : result.message;

    return {
      operations: operations.filter((op) => op.type !== "reply"),
      reply: reply ?? null,
      rejected,
      usage: result.usage,
    };
  }
}
