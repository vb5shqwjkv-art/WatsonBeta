import { newCheckpointId, newVersionId } from "@/lib/ids";
import type { DocumentSnapshot } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Semantic versioning — turn-level undo
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ProseMirror's own history handles keystroke-level undo for manual typing.
 * This layer handles CONVERSATIONAL undo: "go back" / "no, wait" must revert an
 * entire AI action (which may be several editor transactions), not one keypress.
 *
 * Strategy: snapshot-before-turn. Before a mutating turn is applied, we push a
 * checkpoint holding the pre-turn snapshot. Undo restores it. It is simple and
 * always correct; compaction to diffs is an optimization for later.
 */

export interface Checkpoint {
  readonly id: string;
  /** The conversation turn this checkpoint guards. */
  readonly turnId: string;
  readonly timestamp: number;
  /** Human-readable label (e.g. "bold on blk_9f2"), for UI history. */
  readonly label: string;
  /** Document state as it was BEFORE the turn was applied. */
  readonly snapshotBefore: DocumentSnapshot;
}

/** A named, restorable version ("restore the previous version"). */
export interface DocumentVersion {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  readonly snapshot: DocumentSnapshot;
}

/**
 * An in-memory undo/redo stack of checkpoints. Persistence is handled by the
 * storage layer; this class owns only the semantics.
 */
export class CheckpointStack {
  private undoStack: Checkpoint[] = [];
  private redoStack: Checkpoint[] = [];

  constructor(private readonly limit = 100) {}

  /** Record the pre-turn state. Clears the redo stack (new branch of history). */
  push(params: {
    turnId: string;
    label: string;
    snapshotBefore: DocumentSnapshot;
  }): Checkpoint {
    const checkpoint: Checkpoint = {
      id: newCheckpointId(),
      turnId: params.turnId,
      timestamp: Date.now(),
      label: params.label,
      snapshotBefore: params.snapshotBefore,
    };
    this.undoStack.push(checkpoint);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    return checkpoint;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Undo up to `steps` turns. Returns the snapshot to restore to (the state
   * before the earliest undone turn), or `null` if there is nothing to undo.
   */
  undo(steps = 1): DocumentSnapshot | null {
    if (this.undoStack.length === 0) return null;
    const n = Math.min(steps, this.undoStack.length);
    let restore: DocumentSnapshot | null = null;
    for (let i = 0; i < n; i++) {
      const cp = this.undoStack.pop();
      if (!cp) break;
      this.redoStack.push(cp);
      restore = cp.snapshotBefore; // last popped = earliest = target state
    }
    return restore;
  }

  /** The labels of the current undo history, newest last. */
  history(): readonly Pick<Checkpoint, "id" | "label" | "timestamp">[] {
    return this.undoStack.map(({ id, label, timestamp }) => ({
      id,
      label,
      timestamp,
    }));
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

/** Create a named version from a snapshot (for explicit "save version"). */
export function createVersion(
  snapshot: DocumentSnapshot,
  label: string,
): DocumentVersion {
  return {
    id: newVersionId(),
    label,
    timestamp: Date.now(),
    snapshot,
  };
}
