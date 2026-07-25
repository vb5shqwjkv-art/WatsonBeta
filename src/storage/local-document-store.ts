import { newVersionId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import type {
  DocumentPersistence,
  DocumentVersionMeta,
  PersistedDocument,
} from "./document-persistence";

/**
 * localStorage-backed persistence (local mode). Durable across reloads on the
 * same device; replaced by {@link SupabaseDocumentStore} once the user signs
 * in. Version history is kept as a capped list per document.
 */

interface StoredVersion extends DocumentVersionMeta {
  readonly doc: PersistedDocument;
}

const VERSION_LIMIT = 50;

export class LocalDocumentStore implements DocumentPersistence {
  readonly label = "Locale";

  private docKey(documentId: string): string {
    return `avda:doc:${documentId}`;
  }
  private versionsKey(documentId: string): string {
    return `avda:versions:${documentId}`;
  }

  private read<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      logger.warn("local read failed", { key, error: String(error) });
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      logger.warn("local write failed", { key, error: String(error) });
    }
  }

  async load(documentId: string): Promise<PersistedDocument | null> {
    return this.read<PersistedDocument>(this.docKey(documentId));
  }

  async save(documentId: string, doc: PersistedDocument): Promise<void> {
    this.write(this.docKey(documentId), doc);
  }

  async listVersions(documentId: string): Promise<DocumentVersionMeta[]> {
    const versions = this.read<StoredVersion[]>(this.versionsKey(documentId)) ?? [];
    return versions.map(({ id, label, createdAt }) => ({ id, label, createdAt }));
  }

  async saveVersion(
    documentId: string,
    label: string,
    doc: PersistedDocument,
  ): Promise<DocumentVersionMeta> {
    const meta: DocumentVersionMeta = {
      id: newVersionId(),
      label,
      createdAt: new Date().toISOString(),
    };
    const existing = this.read<StoredVersion[]>(this.versionsKey(documentId)) ?? [];
    const next = [{ ...meta, doc }, ...existing].slice(0, VERSION_LIMIT);
    this.write(this.versionsKey(documentId), next);
    return meta;
  }

  async loadVersion(
    documentId: string,
    versionId: string,
  ): Promise<PersistedDocument | null> {
    const versions = this.read<StoredVersion[]>(this.versionsKey(documentId)) ?? [];
    return versions.find((v) => v.id === versionId)?.doc ?? null;
  }
}
