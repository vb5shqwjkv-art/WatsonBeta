import type { SupabaseClient } from "@supabase/supabase-js";
import type { JsonValue } from "@/lib/json";
import type { Annotation } from "@/core/annotations/annotation-manager";
import type {
  DocumentPersistence,
  PersistedDocument,
} from "../document-persistence";

/**
 * Supabase (Postgres) persistence for the signed-in user. One always-current
 * document per user (keyed `<userId>:<documentId>`). Row-Level Security (see
 * supabase/schema.sql) scopes every row to its owner.
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
}
