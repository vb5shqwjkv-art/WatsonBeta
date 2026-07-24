/**
 * A JSON-serializable value.
 *
 * The `core` layer treats the concrete document content (ProseMirror JSON) as
 * an opaque {@link JsonValue}. Only the editor adapter interprets its shape,
 * which keeps the domain layer framework-agnostic and trivially testable.
 */
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export type JsonArray = JsonValue[];
