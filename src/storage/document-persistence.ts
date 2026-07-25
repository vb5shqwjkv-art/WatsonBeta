import type { JsonValue } from "@/lib/json";
import type { Annotation } from "@/core/annotations/annotation-manager";

/**
 * Persistence port for the single, always-current document. Autosave depends on
 * this interface, not on a concrete backend — the localStorage implementation
 * (local mode) and the Supabase implementation (signed-in cloud mode) are
 * interchangeable. There is one live document; there is no version history.
 */
export interface PersistedDocument {
  readonly title: string;
  readonly content: JsonValue;
  readonly annotations?: readonly Annotation[];
  readonly updatedAt: string;
}

export interface DocumentPersistence {
  /** Human-readable name of the backend, for UI ("Locale" / "Cloud"). */
  readonly label: string;

  load(documentId: string): Promise<PersistedDocument | null>;
  save(documentId: string, doc: PersistedDocument): Promise<void>;
}
