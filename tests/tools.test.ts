import { describe, expect, it } from "vitest";
import {
  TOOL_NAMES,
  buildOperationTools,
  toOperationPayload,
} from "@/core/ai/tools";
import { OPERATION_TYPES, parseOperation } from "@/core/operations";

describe("operation tools", () => {
  it("exposes exactly one tool per operation type", () => {
    const tools = buildOperationTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...OPERATION_TYPES].sort());
  });

  it("generates object-typed JSON Schema parameters", () => {
    for (const tool of buildOperationTools()) {
      const params = tool.parameters as { type?: string };
      expect(params.type).toBe("object");
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("round-trips a tool call into a valid operation payload", () => {
    // Simulates the model calling the `format_text` tool.
    const payload = toOperationPayload("format_text", {
      target: { kind: "selection" },
      marks: [{ type: "bold" }],
    });
    const parsed = parseOperation(payload);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.type).toBe("format_text");
  });

  it("keeps TOOL_NAMES in sync with the registry", () => {
    for (const type of OPERATION_TYPES) {
      expect(TOOL_NAMES.has(type)).toBe(true);
    }
  });
});
