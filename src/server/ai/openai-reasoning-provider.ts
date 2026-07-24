import "server-only";
import OpenAI from "openai";
import { logger } from "@/lib/logger";
import type {
  ModelMessage,
  ReasoningProvider,
  ReasoningRequest,
  ReasoningResult,
  RawToolCall,
} from "@/core/ai/providers/types";

/**
 * OpenAI implementation of the {@link ReasoningProvider} port. This is the only
 * place in the codebase that knows about the OpenAI Chat Completions shape; the
 * domain layer depends solely on the neutral interface.
 */
export class OpenAIReasoningProvider implements ReasoningProvider {
  readonly name = "openai";

  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async complete(request: ReasoningRequest): Promise<ReasoningResult> {
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] =
      request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        },
      }));

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: request.system },
      ...request.messages.map(toOpenAIMessage),
    ];

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools,
      tool_choice: request.toolChoice ?? "auto",
      temperature: request.temperature ?? 0.2,
    });

    const choice = completion.choices[0];
    const rawCalls = choice?.message.tool_calls ?? [];

    const toolCalls: RawToolCall[] = rawCalls
      .filter((c) => c.type === "function")
      .map((c) => ({
        id: c.id,
        name: c.function.name,
        arguments: safeJsonParse(c.function.arguments),
      }));

    return {
      toolCalls,
      message: choice?.message.content ?? null,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : null,
    };
  }
}

function toOpenAIMessage(
  m: ModelMessage,
): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  return { role: m.role, content: m.content };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    logger.warn("failed to parse tool call arguments", { raw });
    return {};
  }
}

/** Factory that wires the provider from server env. */
export function createOpenAIReasoningProvider(
  apiKey: string,
  model: string,
): OpenAIReasoningProvider {
  return new OpenAIReasoningProvider(new OpenAI({ apiKey }), model);
}
