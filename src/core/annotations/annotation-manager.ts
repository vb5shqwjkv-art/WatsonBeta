import { newAnnotationId } from "@/lib/ids";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Annotations — free-placement marks anchored to the text
 * ─────────────────────────────────────────────────────────────────────────
 *
 * An annotation (currently: an arrow) is NOT part of the ProseMirror document.
 * It is anchored to a word inside a block and drawn as an overlay at that word's
 * measured screen position, so it can sit pixel-precisely under/over/beside the
 * word and reflow with the text — something a flowing text node cannot do.
 *
 * This manager is pure domain (no DOM); positioning lives in the editor layer.
 */

export type ArrowDirection = "down" | "up" | "left" | "right";

export interface Annotation {
  readonly id: string;
  readonly kind: "arrow";
  /** The top-level block the anchor word lives in. */
  readonly blockId: string;
  /** The word to anchor to; empty string anchors to the whole block. */
  readonly word: string;
  /** 1-based occurrence of `word` within the block. */
  readonly occurrence: number;
  readonly direction: ArrowDirection;
  readonly color: string;
  readonly sizePx: number;
}

export class AnnotationManager {
  private items: Annotation[] = [];

  get all(): readonly Annotation[] {
    return this.items;
  }

  add(spec: Omit<Annotation, "id">): Annotation {
    const annotation: Annotation = { ...spec, id: newAnnotationId() };
    this.items = [...this.items, annotation];
    return annotation;
  }

  removeAll(): void {
    this.items = [];
  }

  /** Remove annotations anchored to a given block. */
  removeForBlock(blockId: string): void {
    this.items = this.items.filter((a) => a.blockId !== blockId);
  }

  /** Replace all annotations (used when restoring an autosaved document). */
  setAll(items: readonly Annotation[]): void {
    this.items = [...items];
  }
}
