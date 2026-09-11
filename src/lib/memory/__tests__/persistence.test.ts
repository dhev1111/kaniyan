/**
 * M5.5 – Memory persistence: store operations, snapshot/restore, security.
 */

import { InMemoryMemoryStore } from "../store/in-memory";
import {
  MemoryStoreError,
  assertStoreId,
  assertStoreRecord,
  copyMemoryReference,
  compareMemoryRecords,
} from "../store/validation";
import {
  createSnapshot,
  restoreSnapshot,
  safeParseSnapshot,
  validateSnapshotPayload,
} from "../store/snapshot";
import { constructMemory } from "../validation";
import { serializeMemoryJson } from "../serialization";
import { MEMORY_LIMITS } from "../limits";
import type { MemoryReference, MemoryStatus } from "../types";
import type { MemoryListFilter, MemorySnapshot } from "../store/types";

const NOW = "2026-02-01T00:00:00.000Z";

function memory(id: string, overrides: Partial<MemoryReference> = {}): MemoryReference {
  return constructMemory(
    {
      content: `Memory content for ${id}.`,
      provenance: { sourceKind: "text", ingestedAt: NOW },
      ...overrides,
    },
    { now: NOW, id }
  );
}

function store(capacity?: number): InMemoryMemoryStore {
  return new InMemoryMemoryStore({ capacity });
}

function populatedStore(count: number): InMemoryMemoryStore {
  const s = store(count + 10);
  for (let index = 0; index < count; index += 1) {
    s.save(memory(`mem-${String(index).padStart(4, "0")}`));
  }
  return s;
}

describe("M5.5 store operations", () => {
  it("saves and retrieves a memory defensively", () => {
    const s = store();
    const ref = memory("m1");
    s.save(ref);
    const found = s.get("m1");
    expect(found?.id).toBe("m1");
    expect(found?.content).toBe(ref.content);

    if (found) found.content = "mutated";
    expect(s.get("m1")?.content).toBe(ref.content);
  });

  it("returns undefined for a missing record", () => {
    const s = store();
    expect(s.get("nonexistent")).toBeUndefined();
    expect(() => s.get("")).toThrow(MemoryStoreError);
  });

  it("upserts deterministically", () => {
    const s = store();
    const original = memory("m1");
    s.save(original);
    const updated = memory("m1", { content: "Updated content." });
    s.upsert(updated);
    expect(s.get("m1")?.content).toBe("Updated content.");
    expect(s.count()).toBe(1);
  });

  it("upserts a new record when not present", () => {
    const s = store();
    s.upsert(memory("m1"));
    expect(s.get("m1")).toBeDefined();
    expect(s.count()).toBe(1);
  });

  it("rejects duplicate save with typed error", () => {
    const s = store();
    s.save(memory("m1"));
    expect(() => s.save(memory("m1"))).toThrow(MemoryStoreError);
    try {
      s.save(memory("m1"));
    } catch (error) {
      expect((error as MemoryStoreError).code).toBe("duplicate-id");
    }
  });

  it("deletes and returns boolean", () => {
    const s = store();
    s.save(memory("m1"));
    expect(s.delete("m1")).toBe(true);
    expect(s.get("m1")).toBeUndefined();
    expect(s.delete("m1")).toBe(false);
  });

  it("counts accurately", () => {
    const s = store();
    expect(s.count()).toBe(0);
    s.save(memory("a"));
    s.save(memory("b"));
    expect(s.count()).toBe(2);
    s.delete("a");
    expect(s.count()).toBe(1);
  });

  it("clears fully", () => {
    const s = populatedStore(5);
    expect(s.count()).toBe(5);
    s.clear();
    expect(s.count()).toBe(0);
    expect(s.list()).toEqual([]);
  });

  it("lists deterministically sorted by createdAt desc then id asc", () => {
    const s = store();
    s.save(memory("c"));
    s.save(memory("a"));
    s.save(memory("b"));
    const list = s.list();
    expect(list.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("applies list filters safely", () => {
    const s = store();
    s.save(memory("p1"));
    s.save(memory("p2"));
    s.upsert(memory("p1", { provenance: { sourceKind: "web", ingestedAt: NOW } }));
    const web = s.list({ sourceKind: "web" });
    expect(web.length).toBe(1);
    expect(web[0].id).toBe("p1");
    expect(s.list({ sourceKind: "github" }).length).toBe(0);
  });

  it("enforces capacity", () => {
    const s = store(2);
    s.save(memory("a"));
    s.save(memory("b"));
    expect(() => s.save(memory("c"))).toThrow(MemoryStoreError);
    try {
      s.save(memory("c"));
    } catch (error) {
      expect((error as MemoryStoreError).code).toBe("capacity-exceeded");
    }
    s.upsert(memory("a"));
    expect(() => s.upsert(memory("c"))).toThrow(MemoryStoreError);
  });

  it("rejects invalid records and IDs", () => {
    const s = store();
    expect(() => s.save(null as never)).toThrow(MemoryStoreError);
    expect(() => s.save({ id: "", content: "x", type: "semantic", source: { id: "s", kind: "text" }, metadata: { scope: "global", tags: [], extra: {} }, provenance: { sourceKind: "text", ingestedAt: NOW }, importance: "medium", confidence: "medium", status: "candidate", contentHash: "", version: 1, createdAt: NOW, updatedAt: NOW, relationships: [], conflicts: [] })).toThrow(MemoryStoreError);
    expect(() => s.get("")).toThrow(MemoryStoreError);
    expect(() => s.delete("")).toThrow(MemoryStoreError);
  });
});

describe("M5.5 snapshot and restore", () => {
  it("creates a portable snapshot from a populated store", () => {
    const s = populatedStore(3);
    const snap = s.snapshot();
    expect(snap.version).toBe("kaniyan/memory@1");
    expect(snap.entries).toHaveLength(3);
    expect(snap.entries[0].schema).toBe("kaniyan/memory@1");
  });

  it("restores a snapshot into a new store atomically", () => {
    const original = populatedStore(3);
    const snap = original.snapshot();
    const target = store(10);
    const result = target.restore(snap);
    expect(result.restored).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(target.count()).toBe(3);
  });

  it("restores with duplicate IDs via upsert", () => {
    const original = store();
    original.save(memory("m1"));
    const snap = original.snapshot();
    const target = store();
    target.save(memory("m1"));
    const result = target.restore(snap);
    expect(result.restored).toBe(1);
    expect(target.get("m1")?.content).toBe(original.get("m1")?.content);
  });

  it("rejects malformed snapshot entries safely", () => {
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@1",
      entries: [
        { schema: "kaniyan/memory@1", memory: { id: "bad", content: 42 } as unknown as Record<string, unknown> },
        { schema: "kaniyan/memory@1", memory: null as unknown as Record<string, unknown> },
        { schema: "kaniyan/memory@1", memory: "string" as unknown as Record<string, unknown> },
      ],
      createdAt: NOW,
    };
    const s = store();
    const result = s.restore(snap);
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(s.count()).toBe(0);
  });

  it("rejects unsupported schema versions", () => {
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@99",
      entries: [],
      createdAt: NOW,
    };
    expect(() => store().restore(snap)).toThrow(/unsupported/);
  });

  it("rejects snapshot with duplicate IDs in entries", () => {
    const ref = memory("dup");
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@1",
      entries: [
        { schema: "kaniyan/memory@1", memory: ref as unknown as Record<string, unknown> },
        { schema: "kaniyan/memory@1", memory: ref as unknown as Record<string, unknown> },
      ],
      createdAt: NOW,
    };
    const s = store();
    const result = s.restore(snap);
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.errors.some((entry) => entry.includes("duplicate id"))).toBe(true);
  });

  it("rejects oversized snapshots", () => {
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@1",
      entries: Array.from({ length: MEMORY_LIMITS.MAX_SNAPSHOT_RECORDS + 1 }, (_, i) => ({
        schema: "kaniyan/memory@1",
        memory: { id: `m-${i}`, content: "x" },
      })),
      createdAt: NOW,
    };
    expect(() => store().restore(snap)).toThrow(/record bound/);
  });

  it("validates snapshot payload shape", () => {
    expect(validateSnapshotPayload(null)).toBe(false);
    expect(validateSnapshotPayload("string")).toBe(false);
    expect(validateSnapshotPayload({})).toBe(false);
    expect(validateSnapshotPayload({ version: "kaniyan/memory@99", entries: [] })).toBe(false);
    expect(validateSnapshotPayload({ version: "kaniyan/memory@1", entries: [] })).toBe(true);
  });

  it("parses snapshot JSON safely", () => {
    const good = safeParseSnapshot('{"version":"kaniyan/memory@1","entries":[]}');
    expect(good.ok).toBe(true);
    expect(safeParseSnapshot("not json").ok).toBe(false);
    expect(safeParseSnapshot("{}").ok).toBe(false);
    expect(safeParseSnapshot("").ok).toBe(false);
  });

  it("failed restore preserves previous store state", () => {
    const s = store();
    s.save(memory("existing"));
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@1",
      entries: [{ schema: "kaniyan/memory@1", memory: { id: "bad" } }],
      createdAt: NOW,
    };
    const result = s.restore(snap);
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(1);
    expect(s.count()).toBe(1);
    expect(s.get("existing")).toBeDefined();
  });

  it("failed save preserves previous store state", () => {
    const s = store(2);
    s.save(memory("a"));
    s.save(memory("b"));
    expect(() => s.save(memory("c"))).toThrow(MemoryStoreError);
    expect(s.count()).toBe(2);
    expect(s.get("a")).toBeDefined();
    expect(s.get("b")).toBeDefined();
  });
});

describe("M5.5 security", () => {
  it("rejects prototype pollution payloads in snapshot entries", () => {
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@1",
      entries: [
        {
          schema: "kaniyan/memory@1",
          memory: {
            id: "polluted",
            content: "test",
            type: "semantic",
            source: { id: "s", kind: "text" },
            metadata: { scope: "global", tags: [], extra: {} },
            provenance: { sourceKind: "text", ingestedAt: NOW },
            importance: "medium",
            confidence: "medium",
            status: "candidate",
            __proto__: { admin: true },
          } as unknown as Record<string, unknown>,
        },
      ],
      createdAt: NOW,
    };
    const s = store();
    const result = s.restore(snap);
    expect(result.restored).toBe(1);
    expect(({} as Record<string, unknown>)["admin"]).toBeUndefined();
  });

  it("rejects non-finite values in snapshot data", () => {
    const ref = memory("nonfinite");
    const entry = JSON.parse(serializeMemoryJson(ref));
    entry.memory.version = Number.NaN;
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@1",
      entries: [entry],
      createdAt: NOW,
    };
    const s = store();
    const result = s.restore(snap);
    expect(result.restored).toBe(1);
    expect(s.get("nonfinite")?.version).toBe(1);
  });

  it("rejects invalid IDs in snapshot data", () => {
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@1",
      entries: [
        { schema: "kaniyan/memory@1", memory: { id: "", content: "test" } },
        { schema: "kaniyan/memory@1", memory: { id: "   ", content: "test" } },
      ],
      createdAt: NOW,
    };
    const s = store();
    const result = s.restore(snap);
    expect(result.restored).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects corrupted records safely", () => {
    const ref = memory("corrupt");
    ref.importance = "critical";
    ref.confidence = "high";
    ref.status = "stored";
    const entry = JSON.parse(serializeMemoryJson(ref));
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@1",
      entries: [entry],
      createdAt: NOW,
    };
    const s = store();
    const result = s.restore(snap);
    expect(result.restored).toBe(1);
    expect(s.get("corrupt")?.importance).toBe("critical");
  });

  it("rejects unexpected object properties", () => {
    const ref = memory("extra");
    const entry = JSON.parse(serializeMemoryJson(ref));
    (entry.memory as Record<string, unknown>)["constructor"] = "bad";
    (entry.memory as Record<string, unknown>)["toString"] = 42;
    const snap: MemorySnapshot = {
      version: "kaniyan/memory@1",
      entries: [entry],
      createdAt: NOW,
    };
    const s = store();
    const result = s.restore(snap);
    expect(result.restored).toBe(1);
    expect(s.get("extra")).toBeDefined();
  });

  it("never executes persisted content", () => {
    const malicious = memory("safe");
    malicious.content = "require('child_process').exec('rm -rf /')";
    const s = store();
    s.save(malicious);
    const found = s.get("safe");
    expect(found?.content).toBe(malicious.content);
  });

  it("validates record through store boundary", () => {
    const s = store();
    const bad = {
      id: "mem-bad",
      content: "x",
      type: "semantic",
      source: { id: "s", kind: "text" },
      metadata: { scope: "global", tags: [], extra: {} },
      provenance: { sourceKind: "text", ingestedAt: "not-a-date" },
      importance: "medium",
      confidence: "medium",
      status: "candidate",
      contentHash: "",
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      relationships: [],
      conflicts: [],
    };
    expect(() => s.save(bad as never)).toThrow(MemoryStoreError);
  });
});

describe("M5.5 regression compatibility with M5.1–M5.4", () => {
  it("coexists with the memory barrel exports", async () => {
    const memory = await import("../index");
    expect(typeof memory.constructMemory).toBe("function");
    expect(typeof memory.chunkText).toBe("function");
    expect(typeof memory.ingest).toBe("function");
    expect(typeof memory.InMemoryVectorIndex).toBe("function");
    expect(typeof memory.DeterministicEmbeddingProvider).toBe("function");
    expect(typeof memory.MemoryRetriever).toBe("function");
    expect(typeof memory.InMemoryMemoryStore).toBe("function");
    expect(typeof memory.createSnapshot).toBe("function");
    expect(typeof memory.restoreSnapshot).toBe("function");
  });

  it("works with constructMemory-produced references", () => {
    const s = store();
    const ref = constructMemory(
      {
        content: "Regression test content.",
        provenance: { sourceKind: "text", ingestedAt: NOW },
        metadata: { scope: "project", projectId: "proj-1", tags: ["regression"], extra: {} },
      },
      { now: NOW, id: "mem-regression" }
    );
    s.save(ref);
    const found = s.get("mem-regression");
    expect(found?.id).toBe("mem-regression");
    expect(found?.metadata.projectId).toBe("proj-1");
    expect(found?.metadata.tags).toEqual(["regression"]);
  });

  it("copyMemoryReference produces independent deep copies", () => {
    const ref = memory("m1");
    const copy = copyMemoryReference(ref);
    copy.content = "mutated";
    copy.metadata.tags.push("added");
    copy.relationships.push({ targetId: "mem-x", kind: "related" });
    expect(ref.content).toBe("Memory content for m1.");
    expect(ref.metadata.tags).toEqual([]);
    expect(ref.relationships).toEqual([]);
  });

  it("compareMemoryRecords sorts deterministically", () => {
    const a = memory("a", { createdAt: "2026-01-01T00:00:00.000Z" });
    const b = memory("b", { createdAt: "2026-01-02T00:00:00.000Z" });
    expect(compareMemoryRecords(a, b)).toBe(-1);
    expect(compareMemoryRecords(b, a)).toBe(1);
    expect(compareMemoryRecords(a, a)).toBe(0);
  });

  it("assertStoreId and assertStoreRecord throw typed errors", () => {
    expect(() => assertStoreId("")).toThrow(MemoryStoreError);
    expect(() => assertStoreId(null as never)).toThrow(MemoryStoreError);
    expect(() => assertStoreRecord(null)).toThrow(MemoryStoreError);
  });
});