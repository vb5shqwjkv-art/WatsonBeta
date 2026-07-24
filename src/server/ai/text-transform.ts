import "server-only";
import type OpenAI from "openai";

/**
 * Focused, tool-less generations used to resolve GENERATIVE operations
 * (`transform_content`, `summarize`) into concrete replacement text. The
 * reasoning engine decides *that* a region should be rewritten; these produce
 * the actual new text for the Editor Controller to insert.
 */

const LENGTH_GUIDANCE: Record<string, string> = {
  oneLine: "Condense it to a single concise sentence.",
  short: "Make it clearly shorter — a few sentences at most.",
  medium: "Shorten it moderately while keeping the key points.",
};

async function complete(
  client: OpenAI,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return (completion.choices[0]?.message.content ?? "").trim();
}

export function focusedTransform(
  client: OpenAI,
  model: string,
  params: { text: string; instruction: string },
): Promise<string> {
  const system =
    "You rewrite a passage of a document according to an instruction about its style or register. Preserve the meaning and the original language. Output ONLY the rewritten passage — no preamble, no quotes, no explanation.";
  return complete(
    client,
    model,
    system,
    `Instruction: ${params.instruction}\n\nPassage:\n${params.text}`,
  );
}

export function focusedSummarize(
  client: OpenAI,
  model: string,
  params: { text: string; targetLength: string },
): Promise<string> {
  const guidance = LENGTH_GUIDANCE[params.targetLength] ?? LENGTH_GUIDANCE.short;
  const system = `You summarize a passage of a document. ${guidance} Keep the original language. Output ONLY the summary — no preamble, no quotes, no explanation.`;
  return complete(client, model, system, params.text);
}
