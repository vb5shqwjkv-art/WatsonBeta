import { newMessageId } from "@/lib/ids";
import type { ModelMessage } from "@/core/ai/providers/types";
import type { AssistantKind, ConversationMessage } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Conversation Manager
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Owns the dialogue history and its projection into provider messages. It does
 * NOT call the model — that is the reasoning engine's job — it curates the
 * record the engine reasons over.
 *
 * Serialization of overlapping turns (the "user keeps talking while a call is
 * in flight" case) is handled by {@link TurnQueue}, kept here because turn
 * ordering is a conversation concern.
 */
export class ConversationManager {
  private messages: ConversationMessage[] = [];

  constructor(private readonly historyLimit = 40) {}

  get all(): readonly ConversationMessage[] {
    return this.messages;
  }

  addUserUtterance(content: string): ConversationMessage {
    return this.push({ role: "user", content });
  }

  addAssistantReply(content: string): ConversationMessage {
    return this.push({ role: "assistant", content, kind: "reply" });
  }

  /** Record a short natural-language summary of an executed action. */
  addAssistantAction(summary: string): ConversationMessage {
    return this.push({ role: "assistant", content: summary, kind: "action" });
  }

  private push(params: {
    role: ConversationMessage["role"];
    content: string;
    kind?: AssistantKind;
  }): ConversationMessage {
    const message: ConversationMessage = {
      id: newMessageId(),
      role: params.role,
      content: params.content,
      timestamp: Date.now(),
      kind: params.kind,
    };
    this.messages.push(message);
    return message;
  }

  /**
   * Project the recent history into provider messages. Assistant "action"
   * summaries are included so the model knows what it already did (crucial for
   * "undo that" and follow-up references).
   */
  toModelMessages(limit = this.historyLimit): ModelMessage[] {
    return this.messages.slice(-limit).map((m) => ({
      role: m.role,
      content:
        m.role === "assistant" && m.kind === "action"
          ? `(you did: ${m.content})`
          : m.content,
    }));
  }

  reset(): void {
    this.messages = [];
  }
}

/**
 * Serializes async turns so that rapid consecutive utterances are processed in
 * order and never interleave document mutations. Each enqueued task runs after
 * the previous one settles.
 */
export class TurnQueue {
  private tail: Promise<unknown> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task);
    // Keep the chain alive even if a task rejects.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
