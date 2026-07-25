import { describe, expect, it } from "vitest";
import {
  describeOperation,
  isDestructive,
  isGenerativeOperation,
  isMutating,
  parseOperation,
  parseOperations,
} from "@/core/operations";
import type { Operation } from "@/core/operations";

/** Parse-or-throw helper for building operation fixtures in tests. */
function op(input: unknown): Operation {
  const r = parseOperation(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("parseOperation", () => {
  it("accepts a valid insert_content op and applies defaults", () => {
    const result = parseOperation({
      type: "insert_content",
      content: { text: "L'osso è un tessuto connettivo." },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // `position` defaults to the cursor.
      expect(result.value).toMatchObject({
        type: "insert_content",
        position: { at: "cursor" },
      });
    }
  });

  it("resolves a symbolic target for format_text", () => {
    const result = parseOperation({
      type: "format_text",
      target: { kind: "selection" },
      marks: [{ type: "bold" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "format_text") {
      expect(result.value.mode).toBe("add"); // default
    }
  });

  it("rejects an unknown operation type", () => {
    const result = parseOperation({ type: "explode_document" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("validation");
  });

  it("rejects a link mark without an href", () => {
    const result = parseOperation({
      type: "format_text",
      target: { kind: "selection" },
      marks: [{ type: "link" }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("parseOperations", () => {
  it("parses a batch and reports the failing index", () => {
    const ok = parseOperations([
      { type: "insert_content", content: { text: "a" } },
      { type: "undo" },
    ]);
    expect(ok.ok).toBe(true);

    const bad = parseOperations([
      { type: "insert_content", content: { text: "a" } },
      { type: "nope" },
    ]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.message).toContain("index 1");
  });
});

describe("operation classifiers", () => {
  it("identifies generative operations", () => {
    const transform = parseOperation({
      type: "transform_content",
      target: { kind: "selection" },
      instruction: "more scientific",
    });
    expect(transform.ok).toBe(true);
    if (transform.ok) expect(isGenerativeOperation(transform.value)).toBe(true);
  });

  it("treats reply as non-mutating", () => {
    const reply = parseOperation({ type: "reply", message: "Sure." });
    expect(reply.ok).toBe(true);
    if (reply.ok) expect(isMutating(reply.value)).toBe(false);
  });

  it("describes an operation for checkpoint labels", () => {
    const table = parseOperation({ type: "create_table", rows: 2, cols: 3 });
    expect(table.ok).toBe(true);
    if (table.ok) expect(describeOperation(table.value)).toBe("Create 2×3 table");
  });

  it("parses absolute and relative font sizes", () => {
    const abs = parseOperation({
      type: "set_font_size",
      target: { kind: "line", line: 3 },
      size: { mode: "absolute", points: 18 },
    });
    expect(abs.ok).toBe(true);
    if (abs.ok) expect(describeOperation(abs.value)).toBe("Font size 18pt");

    const rel = parseOperation({
      type: "set_font_size",
      target: { kind: "selection" },
      size: { mode: "relative", deltaPoints: 2 },
    });
    expect(rel.ok).toBe(true);
    if (rel.ok) expect(describeOperation(rel.value)).toBe("Font size +2pt");

    const reset = parseOperation({
      type: "set_font_size",
      target: { kind: "selection" },
      size: { mode: "reset" },
    });
    expect(reset.ok).toBe(true);
  });

  it("rejects an out-of-range absolute font size", () => {
    const r = parseOperation({
      type: "set_font_size",
      target: { kind: "selection" },
      size: { mode: "absolute", points: 500 },
    });
    expect(r.ok).toBe(false);
  });

  it("flags destructive operations for the confirmation policy", () => {
    expect(isDestructive(op({ type: "delete_content", target: { kind: "selection" } }))).toBe(true);
    expect(isDestructive(op({ type: "replace_content", target: { kind: "selection" }, content: { text: "x" } }))).toBe(true);
    expect(isDestructive(op({ type: "clear_document" }))).toBe(true);
    expect(
      isDestructive(op({ type: "modify_table", tableId: "tbl_1", operation: { op: "deleteRow", at: 0 } })),
    ).toBe(true);

    // Non-destructive: additive / reversible edits.
    expect(isDestructive(op({ type: "insert_content", content: { text: "x" } }))).toBe(false);
    expect(
      isDestructive(op({ type: "modify_table", tableId: "tbl_1", operation: { op: "addRow" } })),
    ).toBe(false);
    expect(isDestructive(op({ type: "format_text", target: { kind: "selection" }, marks: [{ type: "bold" }] }))).toBe(false);
  });
});
