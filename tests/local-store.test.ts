import { beforeEach, describe, expect, it } from "vitest";
import { LocalDocumentStore } from "@/storage/local-document-store";
import type { PersistedDocument } from "@/storage/document-persistence";

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: makeStorage() };
});

const store = new LocalDocumentStore();
const doc: PersistedDocument = {
  title: "Documento",
  content: { type: "doc", content: [] },
  annotations: [],
  updatedAt: "2020-01-01T00:00:00Z",
};

describe("LocalDocumentStore", () => {
  it("saves and loads the current document", async () => {
    await store.save("default", doc);
    const loaded = await store.load("default");
    expect(loaded?.title).toBe("Documento");
    expect(loaded?.content).toEqual({ type: "doc", content: [] });
  });

  it("returns null when nothing is saved", async () => {
    expect(await store.load("default")).toBeNull();
  });

  it("overwrites the single current document on each save", async () => {
    await store.save("default", doc);
    await store.save("default", { ...doc, title: "Aggiornato" });
    const loaded = await store.load("default");
    expect(loaded?.title).toBe("Aggiornato");
  });

  it("reports its backend label", () => {
    expect(store.label).toBe("Locale");
  });
});
