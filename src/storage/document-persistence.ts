import type { JsonValue } from "@/lib/json";

/**
 * Persistence port for the document. Autosave depends on this interface, not on
 * a concrete backend, so the localStorage implementation used now can be
 * swapped for Supabase (Phase 4) without touching the editor/pipeline.
 */
export interface PersistedDocument {
  readonly title: string;
  readonly content: JsonValue;
  readonly updatedAt: string;
}

export interface DocumentPersistence {
  load(documentId: string): PersistedDocument | null;
  save(documentId: string, doc: PersistedDocument): void;
}
