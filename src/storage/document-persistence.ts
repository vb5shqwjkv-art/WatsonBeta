import type { JsonValue } from "@/lib/json";
import type { Annotation } from "@/core/annotations/annotation-manager";

/**
 * Persistence port for the document and its version history. Autosave and
 * versioning depend on this interface, not on a concrete backend — the
 * localStorage implementation (local mode) and the Supabase implementation
 * (signed-in cloud mode) are interchangeable.
 */
export interface PersistedDocument {
  readonly title: string;
  readonly content: JsonValue;
  readonly annotations?: readonly Annotation[];
  readonly updatedAt: string;
}

/** Lightweight metadata for a saved version (no content). */
export interface DocumentVersionMeta {
  readonly id: string;
  readonly label: string;
  readonly createdAt: string;
}

export interface DocumentPersistence {
  /** Human-readable name of the backend, for UI ("Locale" / "Cloud"). */
  readonly label: string;

  load(documentId: string): Promise<PersistedDocument | null>;
  save(documentId: string, doc: PersistedDocument): Promise<void>;

  /** Version history (newest first). */
  listVersions(documentId: string): Promise<DocumentVersionMeta[]>;
  saveVersion(
    documentId: string,
    label: string,
    doc: PersistedDocument,
  ): Promise<DocumentVersionMeta>;
  loadVersion(
    documentId: string,
    versionId: string,
  ): Promise<PersistedDocument | null>;
}
