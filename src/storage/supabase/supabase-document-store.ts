import type { SupabaseClient } from "@supabase/supabase-js";
import { newVersionId } from "@/lib/ids";
import type { JsonValue } from "@/lib/json";
import type { Annotation } from "@/core/annotations/annotation-manager";
import type {
  DocumentPersistence,
  DocumentVersionMeta,
  PersistedDocument,
} from "../document-persistence";

/**
 * Supabase (Postgres) persistence for the signed-in user. One document per user
 * (keyed `<userId>:<documentId>`); version history lives in `document_versions`.
 * Row-Level Security (see supabase/schema.sql) scopes every row to its owner.
 */
export class SupabaseDocumentStore implements DocumentPersistence {
  readonly label = "Cloud";

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  private rowId(documentId: string): string {
    return `${this.userId}:${documentId}`;
  }

  async load(documentId: string): Promise<PersistedDocument | null> {
    const { data, error } = await this.client
      .from("documents")
      .select("title, content, annotations, updated_at")
      .eq("id", this.rowId(documentId))
      .maybeSingle();
    if (error || !data) return null;
    return {
      title: data.title,
      content: data.content as JsonValue,
      annotations: (data.annotations ?? []) as Annotation[],
      updatedAt: data.updated_at,
    };
  }

  async save(documentId: string, doc: PersistedDocument): Promise<void> {
    await this.client.from("documents").upsert({
      id: this.rowId(documentId),
      owner_id: this.userId,
      title: doc.title,
      content: doc.content,
      annotations: doc.annotations ?? [],
      updated_at: doc.updatedAt,
    });
  }

  async listVersions(documentId: string): Promise<DocumentVersionMeta[]> {
    const { data } = await this.client
      .from("document_versions")
      .select("id, label, created_at")
      .eq("document_id", this.rowId(documentId))
      .order("created_at", { ascending: false });
    return (data ?? []).map((v) => ({
      id: v.id,
      label: v.label,
      createdAt: v.created_at,
    }));
  }

  async saveVersion(
    documentId: string,
    label: string,
    doc: PersistedDocument,
  ): Promise<DocumentVersionMeta> {
    const id = newVersionId();
    await this.client.from("document_versions").insert({
      id,
      document_id: this.rowId(documentId),
      label,
      title: doc.title,
      content: doc.content,
      annotations: doc.annotations ?? [],
    });
    return { id, label, createdAt: new Date().toISOString() };
  }

  async loadVersion(
    _documentId: string,
    versionId: string,
  ): Promise<PersistedDocument | null> {
    const { data, error } = await this.client
      .from("document_versions")
      .select("title, content, annotations, created_at")
      .eq("id", versionId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      title: data.title ?? "Documento",
      content: data.content as JsonValue,
      annotations: (data.annotations ?? []) as Annotation[],
      updatedAt: data.created_at,
    };
  }
}
