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
  it("saves and loads a document", async () => {
    await store.save("default", doc);
    const loaded = await store.load("default");
    expect(loaded?.title).toBe("Documento");
    expect(loaded?.content).toEqual({ type: "doc", content: [] });
  });

  it("returns null when nothing is saved", async () => {
    expect(await store.load("default")).toBeNull();
  });

  it("saves, lists, and restores versions (newest first)", async () => {
    await store.saveVersion("default", "prima", doc);
    await store.saveVersion("default", "seconda", doc);
    const list = await store.listVersions("default");
    expect(list.map((v) => v.label)).toEqual(["seconda", "prima"]);

    const restored = await store.loadVersion("default", list[1]!.id);
    expect(restored?.content).toEqual({ type: "doc", content: [] });
  });

  it("returns null for a missing version", async () => {
    expect(await store.loadVersion("default", "ver_missing")).toBeNull();
  });

  it("reports its backend label", () => {
    expect(store.label).toBe("Locale");
  });
});
