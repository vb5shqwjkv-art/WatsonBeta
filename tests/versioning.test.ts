import { describe, expect, it } from "vitest";
import { CheckpointStack } from "@/core/document/versioning";
import type { DocumentSnapshot } from "@/core/document/types";

function snapshot(version: number, text: string): DocumentSnapshot {
  return {
    documentId: "doc_test",
    title: "Test",
    content: { text },
    docVersion: version,
    updatedAt: new Date(0).toISOString(),
  };
}

describe("CheckpointStack", () => {
  it("undoes the most recent turn to its pre-state", () => {
    const stack = new CheckpointStack();
    stack.push({ turnId: "t1", label: "write A", snapshotBefore: snapshot(0, "") });
    stack.push({ turnId: "t2", label: "write B", snapshotBefore: snapshot(1, "A") });

    const restored = stack.undo(1);
    expect(restored?.content).toEqual({ text: "A" });
    expect(stack.canRedo).toBe(true);
  });

  it("undoes multiple turns to the earliest pre-state", () => {
    const stack = new CheckpointStack();
    stack.push({ turnId: "t1", label: "1", snapshotBefore: snapshot(0, "") });
    stack.push({ turnId: "t2", label: "2", snapshotBefore: snapshot(1, "A") });
    stack.push({ turnId: "t3", label: "3", snapshotBefore: snapshot(2, "AB") });

    const restored = stack.undo(2);
    // Undoing t3 then t2 lands on the state before t2.
    expect(restored?.content).toEqual({ text: "A" });
  });

  it("returns null when there is nothing to undo", () => {
    const stack = new CheckpointStack();
    expect(stack.undo()).toBeNull();
    expect(stack.canUndo).toBe(false);
  });

  it("clears redo history when a new turn is pushed", () => {
    const stack = new CheckpointStack();
    stack.push({ turnId: "t1", label: "1", snapshotBefore: snapshot(0, "") });
    stack.undo(1);
    expect(stack.canRedo).toBe(true);
    stack.push({ turnId: "t2", label: "2", snapshotBefore: snapshot(0, "") });
    expect(stack.canRedo).toBe(false);
  });

  it("respects the history limit", () => {
    const stack = new CheckpointStack(2);
    stack.push({ turnId: "t1", label: "1", snapshotBefore: snapshot(0, "") });
    stack.push({ turnId: "t2", label: "2", snapshotBefore: snapshot(1, "A") });
    stack.push({ turnId: "t3", label: "3", snapshotBefore: snapshot(2, "AB") });
    expect(stack.history()).toHaveLength(2);
  });
});
