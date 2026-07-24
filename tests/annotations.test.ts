import { describe, expect, it } from "vitest";
import { AnnotationManager } from "@/core/annotations/annotation-manager";
import { isMutating, parseOperation } from "@/core/operations";

function arrow(blockId: string, word: string) {
  return {
    kind: "arrow" as const,
    blockId,
    word,
    occurrence: 1,
    direction: "down" as const,
    color: "#1a1a1a",
    sizePx: 24,
  };
}

describe("AnnotationManager", () => {
  it("adds annotations with generated ids", () => {
    const m = new AnnotationManager();
    const a = m.add(arrow("blk_1", "osso"));
    expect(a.id).toMatch(/^ann_/);
    expect(m.all).toHaveLength(1);
  });

  it("removes annotations for a block and all at once", () => {
    const m = new AnnotationManager();
    m.add(arrow("blk_1", "osso"));
    m.add(arrow("blk_2", "cane"));
    m.removeForBlock("blk_1");
    expect(m.all.map((a) => a.blockId)).toEqual(["blk_2"]);
    m.removeAll();
    expect(m.all).toHaveLength(0);
  });

  it("restores a set of annotations", () => {
    const m = new AnnotationManager();
    m.setAll([{ ...arrow("blk_9", "x"), id: "ann_restored" }]);
    expect(m.all[0]?.id).toBe("ann_restored");
  });
});

describe("annotation operations", () => {
  it("parses annotate with defaults", () => {
    const r = parseOperation({
      type: "annotate",
      target: { kind: "line", line: 1 },
      word: "osso",
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.type === "annotate") {
      expect(r.value.direction).toBe("down");
      expect(r.value.occurrence).toBe(1);
      expect(r.value.size).toBe("normal");
      expect(isMutating(r.value)).toBe(false);
    }
  });

  it("parses clear_annotations as non-mutating", () => {
    const r = parseOperation({ type: "clear_annotations" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(isMutating(r.value)).toBe(false);
  });
});
