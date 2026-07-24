import type { JsonValue } from "@/lib/json";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Provider abstraction for the reasoning LLM
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The `core` reasoning engine talks to this interface, never to a concrete
 * vendor SDK. Swapping OpenAI for another provider means adding one adapter
 * under `providers/` — the domain layer does not change.
 */

/** A neutral, vendor-agnostic tool definition (JSON-Schema parameters). */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the tool arguments (an object schema). */
  readonly parameters: JsonValue;
}

/** A message in the format the provider consumes. */
export interface ModelMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ReasoningRequest {
  readonly system: string;
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ToolDefinition[];
  /** "auto" lets the model reply or call tools; "required" forces a tool call. */
  readonly toolChoice?: "auto" | "required";
  readonly temperature?: number;
}

/** A raw tool call as returned by the provider, before domain validation. */
export interface RawToolCall {
  readonly id: string;
  readonly name: string;
  /** Parsed JSON arguments; validated against the Operation schema downstream. */
  readonly arguments: unknown;
}

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface ReasoningResult {
  /** Tool calls the model chose to make, in order. May be empty. */
  readonly toolCalls: readonly RawToolCall[];
  /** A free-text assistant message, when the model replied conversationally. */
  readonly message: string | null;
  readonly usage: TokenUsage | null;
}

/** The port the reasoning engine depends on. */
export interface ReasoningProvider {
  readonly name: string;
  complete(request: ReasoningRequest): Promise<ReasoningResult>;
}
