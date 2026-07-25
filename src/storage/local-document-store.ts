import { logger } from "@/lib/logger";
import type {
  DocumentPersistence,
  PersistedDocument,
} from "./document-persistence";

/**
 * localStorage-backed persistence (local mode). Keeps a single, always-current
 * document durable across reloads on the same device; replaced by
 * {@link SupabaseDocumentStore} once the user signs in.
 */
export class LocalDocumentStore implements DocumentPersistence {
  readonly label = "Locale";

  private docKey(documentId: string): string {
    return `avda:doc:${documentId}`;
  }

  async load(documentId: string): Promise<PersistedDocument | null> {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(this.docKey(documentId));
      return raw ? (JSON.parse(raw) as PersistedDocument) : null;
    } catch (error) {
      logger.warn("local load failed", { error: String(error) });
      return null;
    }
  }

  async save(documentId: string, doc: PersistedDocument): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(this.docKey(documentId), JSON.stringify(doc));
    } catch (error) {
      logger.warn("local save failed", { error: String(error) });
    }
  }
}
