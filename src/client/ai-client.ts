import type { DocumentIndex, SelectionState } from "@/core/document/types";
import type { ModelMessage } from "@/core/ai/providers/types";
import { parseOperations, type Operation } from "@/core/operations";

/**
 * Thin client-side wrappers over the server AI routes. The browser owns the
 * live document, so it sends the projected index + selection and receives
 * validated operations back.
 */

export interface ReasonRequest {
  utterance: string;
  index: DocumentIndex;
  selection: SelectionState;
  history: readonly ModelMessage[];
  hiddenBefore?: number;
  hiddenAfter?: number;
}

export interface ReasonResult {
  operations: Operation[];
  reply: string | null;
  basedOnVersion: number;
}

export async function requestReasoning(
  body: ReasonRequest,
  signal?: AbortSignal,
): Promise<ReasonResult> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Reasoning request failed (${res.status}).`);

  const data: unknown = await res.json();
  const record = (data ?? {}) as Record<string, unknown>;
  const parsed = parseOperations(record.operations ?? []);

  return {
    operations: parsed.ok ? parsed.value : [],
    reply: typeof record.reply === "string" ? record.reply : null,
    basedOnVersion:
      typeof record.basedOnVersion === "number"
        ? record.basedOnVersion
        : body.index.docVersion,
  };
}

export type TransformMode = "transform" | "summarize";

export async function requestTextTransform(
  body:
    | { mode: "transform"; text: string; instruction: string }
    | { mode: "summarize"; text: string; targetLength: string },
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/ai/transform", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Transform request failed (${res.status}).`);
  const data: unknown = await res.json();
  const text = (data as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}
