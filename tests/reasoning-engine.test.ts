import { describe, expect, it } from "vitest";
import { ReasoningEngine } from "@/core/ai/reasoning-engine";
import type {
  ReasoningProvider,
  ReasoningResult,
} from "@/core/ai/providers/types";
import { EMPTY_INDEX } from "@/core/document/document-index";
import { EMPTY_SELECTION } from "@/core/document/types";

/** A provider that returns pre-scripted results, one per `complete` call. */
class ScriptedProvider implements ReasoningProvider {
  readonly name = "scripted";
  private i = 0;
  public calls = 0;
  constructor(private readonly script: ReasoningResult[]) {}
  async complete(): Promise<ReasoningResult> {
    this.calls++;
    return (
      this.script[this.i++] ?? { toolCalls: [], message: null, usage: null }
    );
  }
}

const usage = (t: number) => ({
  promptTokens: t,
  completionTokens: t,
  totalTokens: t,
});

function run(provider: ReasoningProvider, docVersion = 0) {
  const engine = new ReasoningEngine(provider);
  return engine.run({
    utterance: "test",
    index: { ...EMPTY_INDEX, docVersion },
    selection: EMPTY_SELECTION,
    history: [],
  });
}

describe("ReasoningEngine", () => {
  it("passes a valid tool call through as an operation", async () => {
    const provider = new ScriptedProvider([
      {
        toolCalls: [
          {
            id: "1",
            name: "insert_content",
            arguments: { content: { text: "Ciao" } },
          },
        ],
        message: null,
        usage: usage(15),
      },
    ]);
    const outcome = await run(provider, 3);
    expect(outcome.operations).toHaveLength(1);
    expect(outcome.operations[0]?.type).toBe("insert_content");
    expect(outcome.rejected).toHaveLength(0);
    expect(outcome.basedOnVersion).toBe(3);
    expect(outcome.usage?.totalTokens).toBe(15);
    expect(provider.calls).toBe(1);
  });

  it("repairs an invalid tool call on a second attempt", async () => {
    const provider = new ScriptedProvider([
      {
        // Invalid: format_text requires at least one mark.
        toolCalls: [
          { id: "1", name: "format_text", arguments: { target: { kind: "selection" } } },
        ],
        message: null,
        usage: usage(10),
      },
      {
        // Corrected on repair.
        toolCalls: [
          {
            id: "2",
            name: "format_text",
            arguments: { target: { kind: "selection" }, marks: [{ type: "bold" }] },
          },
        ],
        message: null,
        usage: usage(8),
      },
    ]);
    const outcome = await run(provider);
    expect(provider.calls).toBe(2);
    expect(outcome.operations).toHaveLength(1);
    expect(outcome.operations[0]?.type).toBe("format_text");
    expect(outcome.rejected).toHaveLength(0);
    // Usage is summed across the original + repair attempt.
    expect(outcome.usage?.totalTokens).toBe(18);
  });

  it("reports rejections that survive the repair budget", async () => {
    const invalid: ReasoningResult = {
      toolCalls: [
        { id: "x", name: "format_text", arguments: { target: { kind: "selection" } } },
      ],
      message: null,
      usage: usage(5),
    };
    const provider = new ScriptedProvider([invalid, invalid, invalid]);
    const outcome = await run(provider);
    // Default maxRepairAttempts is 1 → two provider calls total.
    expect(provider.calls).toBe(2);
    expect(outcome.operations).toHaveLength(0);
    expect(outcome.rejected).toHaveLength(1);
    expect(outcome.rejected[0]?.name).toBe("format_text");
  });

  it("surfaces a reply operation as the reply string", async () => {
    const provider = new ScriptedProvider([
      {
        toolCalls: [
          { id: "1", name: "reply", arguments: { message: "Certo, dimmi pure." } },
        ],
        message: null,
        usage: null,
      },
    ]);
    const outcome = await run(provider);
    expect(outcome.operations).toHaveLength(0);
    expect(outcome.reply).toBe("Certo, dimmi pure.");
  });

  it("falls back to the free-text message as a reply", async () => {
    const provider = new ScriptedProvider([
      { toolCalls: [], message: "Non ho capito, puoi ripetere?", usage: null },
    ]);
    const outcome = await run(provider);
    expect(outcome.reply).toBe("Non ho capito, puoi ripetere?");
  });
});
