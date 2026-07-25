import { describe, expect, it } from "vitest";
import {
  buildComparisonJSON,
  buildListJSON,
  buildTableJSON,
  contentSpecToJSON,
} from "@/editor/content-builder";
import { parseOperation } from "@/core/operations";

function op(input: unknown) {
  const r = parseOperation(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("contentSpecToJSON", () => {
  it("splits text into paragraphs on blank lines", () => {
    const nodes = contentSpecToJSON({ text: "Primo.\n\nSecondo." });
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.type).toBe("paragraph");
  });

  it("wraps text as a heading when asked", () => {
    const nodes = contentSpecToJSON({ text: "Titolo", as: "heading" });
    expect(nodes[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
  });

  it("wraps text as a code block", () => {
    const nodes = contentSpecToJSON({ text: "const x = 1", as: "codeBlock" });
    expect(nodes[0]?.type).toBe("codeBlock");
  });
});

describe("buildTableJSON", () => {
  it("builds a header row and prefills data", () => {
    const table = buildTableJSON(
      op({
        type: "create_table",
        rows: 2,
        cols: 2,
        withHeaderRow: true,
        data: [
          ["A", "B"],
          ["c", "d"],
        ],
      }) as never,
    );
    const rows = table.content ?? [];
    expect(rows).toHaveLength(2);
    const firstRowCells = rows[0]?.content ?? [];
    expect(firstRowCells[0]?.type).toBe("tableHeader");
    // Second row is body, prefilled with "c".
    const secondRowCells = rows[1]?.content ?? [];
    expect(secondRowCells[0]?.type).toBe("tableCell");
  });
});

describe("buildListJSON", () => {
  it("builds a bullet list of list items", () => {
    const list = buildListJSON(
      op({
        type: "create_list",
        listKind: "bullet",
        items: ["uno", "due"],
      }) as never,
    );
    expect(list.type).toBe("bulletList");
    expect(list.content).toHaveLength(2);
    expect(list.content?.[0]?.type).toBe("listItem");
  });

  it("builds a task list with checkable items", () => {
    const list = buildListJSON(
      op({
        type: "create_list",
        listKind: "task",
        items: ["fatto", "da fare"],
      }) as never,
    );
    expect(list.type).toBe("taskList");
    expect(list.content?.[0]).toMatchObject({
      type: "taskItem",
      attrs: { checked: false },
    });
  });
});

describe("buildComparisonJSON", () => {
  it("builds N equal columns, each titled and ready for content", () => {
    const comp = buildComparisonJSON(
      op({
        type: "create_comparison",
        columns: 3,
        titles: ["A", "B", "C"],
      }) as never,
    );
    expect(comp.type).toBe("comparison");
    expect(comp.content).toHaveLength(3);

    const first = comp.content?.[0];
    expect(first?.type).toBe("comparisonColumn");
    // Bold title paragraph, then an empty paragraph for content to flow into.
    expect(first?.content).toHaveLength(2);
    expect(first?.content?.[0]?.content?.[0]).toMatchObject({
      type: "text",
      text: "A",
      marks: [{ type: "bold" }],
    });
    expect(first?.content?.[1]).toMatchObject({ type: "paragraph" });
  });

  it("builds untitled columns with a single empty paragraph", () => {
    const comp = buildComparisonJSON(
      op({ type: "create_comparison", columns: 2 }) as never,
    );
    expect(comp.content).toHaveLength(2);
    expect(comp.content?.[0]?.content).toHaveLength(1);
  });
});

describe("color mark", () => {
  it("accepts a color mark with a color value", () => {
    const r = parseOperation({
      type: "format_text",
      target: { kind: "selection" },
      marks: [{ type: "color", color: "red" }],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a color mark without a color", () => {
    const r = parseOperation({
      type: "format_text",
      target: { kind: "selection" },
      marks: [{ type: "color" }],
    });
    expect(r.ok).toBe(false);
  });
});
