import { logger } from "@/lib/logger";
import type {
  DocumentPersistence,
  PersistedDocument,
} from "./document-persistence";

/**
 * localStorage-backed autosave. Durable across reloads on the same device;
 * intentionally simple so it can be replaced by a Supabase repository later
 * behind the same {@link DocumentPersistence} interface.
 */
export class LocalDocumentStore implements DocumentPersistence {
  private key(documentId: string): string {
    return `avda:doc:${documentId}`;
  }

  load(documentId: string): PersistedDocument | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(this.key(documentId));
      return raw ? (JSON.parse(raw) as PersistedDocument) : null;
    } catch (error) {
      logger.warn("failed to load persisted document", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  save(documentId: string, doc: PersistedDocument): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(this.key(documentId), JSON.stringify(doc));
    } catch (error) {
      logger.warn("failed to persist document", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
