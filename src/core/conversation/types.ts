/** Conversation domain types. */

export type ConversationRole = "user" | "assistant";

/** What an assistant message represents, for UI rendering and history. */
export type AssistantKind = "reply" | "action";

export interface ConversationMessage {
  readonly id: string;
  readonly role: ConversationRole;
  readonly content: string;
  readonly timestamp: number;
  /** For assistant messages: whether it edited the doc or just replied. */
  readonly kind?: AssistantKind;
  /** Whether the transcript is still partial (interim STT result). */
  readonly interim?: boolean;
}
