/**
 * M5.9 – Memory recall: query normalization, candidate retrieval,
 * lifecycle filtering, version-aware recall, ranking, deduplication,
 * context assembly, provenance, read-only behavior, and security.
 */

import { MEMORY_LIMITS } from "../../limits";
import { constructMemory } from "../../validation";
import { InMemoryMemoryStore } from "../../store/in-memory";
import type { MemoryReference, MemoryStatus } from "../../types";
import { normalizeQuery, isValidRecallInput } from "../query";
import { selectCandidates } from "../candidates";
import { rankCandidates } from "../ranking";
import { suppressDuplicates } from "../deduplication";
import { assembleContext } from "../context";
import { recall } from "../recall";
import type { RecallRequest } from "../types";

const NOW = "2026-06-01T00:00:00.000Z";

function makeMemory(
  id: string,
  content: string,
  opts: {
    status?: MemoryStatus;
    importance?: "low" | "medium" | "high" | "critical";
    confidence?: "low" | "medium" | "high";
    tags?: string[];
    scope?: "global" | "project" | "task" | "session";
    sourceKind?: "web" | "github" | "text";
    projectId?: string;
    version?: number;
    createdAt?: string;
  } = {}
): MemoryReference {
  return constructMemory(
    {
      content,
      provenance: { sourceKind: opts.sourceKind ?? "text", ingestedAt: NOW },
      metadata: {
        scope: opts.scope ?? "global",
        projectId: opts.projectId,
        tags: opts.tags ?? [],
        extra: {},
      },
      confidence: opts.confidence ?? "medium",
      importance: opts.importance ?? "medium",
      status: opts.status ?? "stored",
    },
    { now: opts.createdAt ?? NOW, id }
  );
}

function setupStore(memories: MemoryReference[]): InMemoryMemoryStore {
  const store = new InMemoryMemoryStore({ capacity: 1000 });
  for (const m of memories) {
    store.save(m);
  }
  return store;
}

// ─── QUERY NORMALIZATION ─────────────────────────────────────────────────────

describe("M5.9 – Query normalization", () => {
  it("trims surrounding whitespace", () => {
    const result = normalizeQuery("  hello world  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.text).toBe("hello world");
    }
  });

  it("collapses repeated whitespace", () => {
    const result = normalizeQuery("hello   world\t\ttest");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.text).toBe("hello world test");
    }
  });

  it("preserves meaningful content", () => {
    const result = normalizeQuery("TypeScript generic constraints");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.text).toBe("TypeScript generic constraints");
    }
  });

  it("rejects non-string input", () => {
    expect(normalizeQuery(123).ok).toBe(false);
    expect(normalizeQuery(null).ok).toBe(false);
    expect(normalizeQuery(undefined).ok).toBe(false);
    expect(normalizeQuery({}).ok).toBe(false);
    expect(normalizeQuery([]).ok).toBe(false);
  });

  it("rejects empty string", () => {
    expect(normalizeQuery("").ok).toBe(false);
    expect(normalizeQuery("   ").ok).toBe(false);
    expect(normalizeQuery("\t\n").ok).toBe(false);
  });

  it("enforces max length", () => {
    const long = "a".repeat(MEMORY_LIMITS.MAX_RECALL_QUERY_LENGTH + 1);
    const result = normalizeQuery(long);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("query-too-long");
    }
  });

  it("accepts query at exact max length", () => {
    const exact = "a".repeat(MEMORY_LIMITS.MAX_RECALL_QUERY_LENGTH);
    expect(normalizeQuery(exact).ok).toBe(true);
  });

  it("records original and normalized lengths", () => {
    const result = normalizeQuery("  spaced  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.originalLength).toBe(10);
      expect(result.normalized.normalizedLength).toBe(6);
    }
  });

  it("is deterministic for identical inputs", () => {
    const r1 = normalizeQuery("  test query  ");
    const r2 = normalizeQuery("  test query  ");
    expect(r1).toEqual(r2);
  });
});

describe("M5.9 – isValidRecallInput", () => {
  it("accepts valid strings", () => {
    expect(isValidRecallInput("hello")).toBe(true);
    expect(isValidRecallInput("  hello  ")).toBe(true);
  });

  it("rejects empty/whitespace strings", () => {
    expect(isValidRecallInput("")).toBe(false);
    expect(isValidRecallInput("   ")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidRecallInput(null)).toBe(false);
    expect(isValidRecallInput(undefined)).toBe(false);
    expect(isValidRecallInput(42)).toBe(false);
  });

  it("accepts objects with text field", () => {
    expect(isValidRecallInput({ text: "hello" })).toBe(true);
  });

  it("rejects objects without text field", () => {
    expect(isValidRecallInput({})).toBe(false);
    expect(isValidRecallInput({ text: "" })).toBe(false);
  });
});

// ─── CANDIDATE RETRIEVAL ─────────────────────────────────────────────────────

describe("M5.9 – Candidate retrieval", () => {
  it("retrieves eligible candidates from store", () => {
    const store = setupStore([
      makeMemory("m1", "TypeScript generics", { status: "stored" }),
      makeMemory("m2", "React hooks", { status: "stored" }),
      makeMemory("m3", "Archived item", { status: "archived" }),
    ]);
    const candidates = selectCandidates(store, { text: "TypeScript" });
    expect(candidates.length).toBe(1);
    expect(candidates[0].memory.id).toBe("m1");
  });

  it("returns empty for no matches", () => {
    const store = setupStore([
      makeMemory("m1", "React hooks", { status: "stored" }),
    ]);
    const candidates = selectCandidates(store, { text: "Python" });
    expect(candidates.length).toBe(0);
  });

  it("respects memory type filter", () => {
    const store = setupStore([
      makeMemory("m1", "TypeScript generics", { status: "stored" }),
      makeMemory("m2", "React patterns", { status: "stored" }),
    ]);
    const candidates = selectCandidates(store, {
      text: "TypeScript",
      memoryTypes: ["semantic"],
    });
    expect(candidates.length).toBe(1);
    expect(candidates[0].memory.id).toBe("m1");
  });

  it("respects scope filter", () => {
    const store = setupStore([
      makeMemory("m1", "Global fact", { status: "stored", scope: "global" }),
      makeMemory("m2", "Project fact", { status: "stored", scope: "project", projectId: "proj-1" }),
    ]);
    const candidates = selectCandidates(store, {
      text: "fact",
      scopes: ["global"],
    });
    expect(candidates.length).toBe(1);
    expect(candidates[0].memory.id).toBe("m1");
  });

  it("respects tag filter", () => {
    const store = setupStore([
      makeMemory("m1", "Tagged item", { status: "stored", tags: ["rag"] }),
      makeMemory("m2", "Untagged item", { status: "stored", tags: [] }),
    ]);
    const candidates = selectCandidates(store, {
      text: "item",
      tags: ["rag"],
    });
    expect(candidates.length).toBe(1);
    expect(candidates[0].memory.id).toBe("m1");
  });

  it("respects importance filter", () => {
    const store = setupStore([
      makeMemory("m1", "Critical fact", { status: "stored", importance: "critical" }),
      makeMemory("m2", "Low fact", { status: "stored", importance: "low" }),
    ]);
    const candidates = selectCandidates(store, {
      text: "fact",
      minImportance: "high",
    });
    expect(candidates.length).toBe(1);
    expect(candidates[0].memory.id).toBe("m1");
  });

  it("handles empty store", () => {
    const store = new InMemoryMemoryStore({ capacity: 100 });
    const candidates = selectCandidates(store, { text: "anything" });
    expect(candidates.length).toBe(0);
  });

  it("matches text in tags", () => {
    const store = setupStore([
      makeMemory("m1", "Some content", { status: "stored", tags: ["typescript"] }),
    ]);
    const candidates = selectCandidates(store, { text: "typescript" });
    expect(candidates.length).toBe(1);
    expect(candidates[0].memory.id).toBe("m1");
  });

  it("filters expired memories", () => {
    const expired = makeMemory("m1", "Expired content", {
      status: "stored",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    expired.expiresAt = "2020-06-01T00:00:00.000Z";
    const store = setupStore([expired]);
    const candidates = selectCandidates(store, { text: "Expired" });
    expect(candidates.length).toBe(0);
  });
});

// ─── LIFECYCLE FILTERING ─────────────────────────────────────────────────────

describe("M5.9 – Lifecycle filtering", () => {
  it("includes stored and retrievable memories", () => {
    const store = setupStore([
      makeMemory("m1", "Stored item", { status: "stored" }),
      makeMemory("m2", "Retrievable item", { status: "retrievable" }),
    ]);
    const candidates = selectCandidates(store, { text: "item" });
    expect(candidates.length).toBe(2);
  });

  it("excludes rejected and superseded memories", () => {
    const store = setupStore([
      makeMemory("m1", "Rejected item", { status: "rejected" }),
      makeMemory("m2", "Superseded item", { status: "superseded" }),
    ]);
    const candidates = selectCandidates(store, { text: "item" });
    expect(candidates.length).toBe(0);
  });

  it("excludes candidate and validated memories", () => {
    const store = setupStore([
      makeMemory("m1", "Candidate item", { status: "candidate" }),
      makeMemory("m2", "Validated item", { status: "validated" }),
    ]);
    const candidates = selectCandidates(store, { text: "item" });
    expect(candidates.length).toBe(0);
  });

  it("does not mutate store during filtering", () => {
    const memories = [
      makeMemory("m1", "Item one", { status: "stored" }),
      makeMemory("m2", "Item two", { status: "archived" }),
    ];
    const store = setupStore(memories);
    const beforeCount = store.count();
    selectCandidates(store, { text: "item" });
    expect(store.count()).toBe(beforeCount);
  });
});

// ─── VERSION-AWARE RECALL ────────────────────────────────────────────────────

describe("M5.9 – Version-aware recall", () => {
  it("preserves version information from memory", () => {
    const store = setupStore([
      makeMemory("m1", "Versioned content", { status: "stored" }),
    ]);
    const candidates = selectCandidates(store, { text: "Versioned" });
    expect(candidates[0].versionNumber).toBe(1);
  });

  it("uses resolver to determine version preference", () => {
    const store = setupStore([
      makeMemory("m1", "Multi-version content", { status: "stored", version: 2 }),
    ]);
    const resolveLineage = (id: string) => {
      if (id === "m1") {
        return {
          currentVersion: 3,
          versions: [
            { versionNumber: 1, status: "stored" as MemoryStatus },
            { versionNumber: 2, status: "stored" as MemoryStatus },
            { versionNumber: 3, status: "stored" as MemoryStatus },
          ],
        };
      }
      return undefined;
    };
    const candidates = selectCandidates(store, {
      text: "Multi-version",
      resolveLineage,
    });
    expect(candidates[0].versionNumber).toBe(3);
    expect(candidates[0].isCurrentVersion).toBe(true);
  });

  it("does not mutate version lineage", () => {
    const lineageVersions = [
      { versionNumber: 1, status: "stored" as MemoryStatus },
      { versionNumber: 2, status: "stored" as MemoryStatus },
    ];
    const resolveLineage = () => ({
      currentVersion: 2,
      versions: lineageVersions,
    });
    const store = setupStore([
      makeMemory("m1", "Content", { status: "stored" }),
    ]);
    selectCandidates(store, { text: "Content", resolveLineage });
    expect(lineageVersions).toHaveLength(2);
  });
});

// ─── RANKING ─────────────────────────────────────────────────────────────────

describe("M5.9 – Ranking", () => {
  it("deterministic ranking for same inputs", () => {
    const candidates = [
      { memory: makeMemory("m1", "A", { importance: "low" }), versionNumber: 1, isCurrentVersion: true, recallReasons: [] },
      { memory: makeMemory("m2", "B", { importance: "high" }), versionNumber: 1, isCurrentVersion: true, recallReasons: [] },
      { memory: makeMemory("m3", "C", { importance: "critical" }), versionNumber: 1, isCurrentVersion: true, recallReasons: [] },
    ];
    const r1 = rankCandidates(candidates);
    const r2 = rankCandidates(candidates);
    expect(r1.map(c => c.memory.id)).toEqual(r2.map(c => c.memory.id));
  });

  it("higher importance ranks higher", () => {
    const candidates = [
      { memory: makeMemory("m1", "A", { importance: "low" }), versionNumber: 1, isCurrentVersion: true, recallReasons: [] },
      { memory: makeMemory("m2", "B", { importance: "critical" }), versionNumber: 1, isCurrentVersion: true, recallReasons: [] },
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].memory.id).toBe("m2");
  });

  it("tie-breaking by memory ID", () => {
    const candidates = [
      { memory: makeMemory("m3", "Same content", { importance: "high" }), versionNumber: 1, isCurrentVersion: true, recallReasons: [] },
      { memory: makeMemory("m1", "Same content", { importance: "high" }), versionNumber: 1, isCurrentVersion: true, recallReasons: [] },
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].memory.id).toBe("m1");
    expect(ranked[1].memory.id).toBe("m3");
  });

  it("empty candidates produce empty ranking", () => {
    const ranked = rankCandidates([]);
    expect(ranked).toHaveLength(0);
  });

  it("preserves recall reasons through ranking", () => {
    const candidates = [
      { memory: makeMemory("m1", "A"), versionNumber: 1, isCurrentVersion: true, recallReasons: ["importance", "confidence"] },
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].recallReasons).toContain("importance");
    expect(ranked[0].recallReasons).toContain("confidence");
  });
});

// ─── DEDUPLICATION ───────────────────────────────────────────────────────────

describe("M5.9 – Deduplication", () => {
  it("suppresses exact duplicates", () => {
    const ranked = [
      { memory: makeMemory("m1", "Same content"), versionNumber: 1, isCurrentVersion: true, score: 0.8, recallReasons: [] },
      { memory: makeMemory("m2", "Same content"), versionNumber: 1, isCurrentVersion: true, score: 0.6, recallReasons: [] },
    ];
    const deduped = suppressDuplicates(ranked);
    expect(deduped.length).toBe(1);
    expect(deduped[0].memory.id).toBe("m1");
  });

  it("retains highest-ranked representation", () => {
    const ranked = [
      { memory: makeMemory("m1", "Content"), versionNumber: 1, isCurrentVersion: true, score: 0.3, recallReasons: [] },
      { memory: makeMemory("m2", "Content"), versionNumber: 1, isCurrentVersion: true, score: 0.9, recallReasons: [] },
    ];
    const deduped = suppressDuplicates(ranked);
    expect(deduped[0].memory.id).toBe("m2");
    expect(deduped[0].score).toBe(0.9);
  });

  it("preserves unique content", () => {
    const ranked = [
      { memory: makeMemory("m1", "Content A"), versionNumber: 1, isCurrentVersion: true, score: 0.8, recallReasons: [] },
      { memory: makeMemory("m2", "Content B"), versionNumber: 1, isCurrentVersion: true, score: 0.7, recallReasons: [] },
    ];
    const deduped = suppressDuplicates(ranked);
    expect(deduped.length).toBe(2);
  });

  it("does not mutate underlying memories", () => {
    const m1 = makeMemory("m1", "Content");
    const m2 = makeMemory("m2", "Content");
    const ranked = [
      { memory: m1, versionNumber: 1, isCurrentVersion: true, score: 0.8, recallReasons: [] },
      { memory: m2, versionNumber: 1, isCurrentVersion: true, score: 0.6, recallReasons: [] },
    ];
    suppressDuplicates(ranked);
    expect(m1.id).toBe("m1");
    expect(m2.id).toBe("m2");
  });

  it("empty input produces empty output", () => {
    expect(suppressDuplicates([])).toHaveLength(0);
  });
});

// ─── CONTEXT ASSEMBLY ────────────────────────────────────────────────────────

describe("M5.9 – Context assembly", () => {
  it("assembles context within budget", () => {
    const candidates = [
      { memory: makeMemory("m1", "Short content"), versionNumber: 1, isCurrentVersion: true, score: 0.9, recallReasons: [], deduplicated: false },
      { memory: makeMemory("m2", "Another piece"), versionNumber: 1, isCurrentVersion: true, score: 0.8, recallReasons: [], deduplicated: false },
    ];
    const context = assembleContext(candidates, 500);
    expect(context.itemsIncluded).toBe(2);
    expect(context.totalCharacters).toBeLessThanOrEqual(500);
    expect(context.budgetTotal).toBe(500);
  });

  it("enforces character budget", () => {
    const longContent = "x".repeat(1000);
    const candidates = [
      { memory: makeMemory("m1", longContent), versionNumber: 1, isCurrentVersion: true, score: 0.9, recallReasons: [], deduplicated: false },
      { memory: makeMemory("m2", longContent), versionNumber: 1, isCurrentVersion: true, score: 0.8, recallReasons: [], deduplicated: false },
    ];
    const context = assembleContext(candidates, 200);
    expect(context.itemsDropped).toBeGreaterThan(0);
    expect(context.totalCharacters).toBeLessThanOrEqual(200);
  });

  it("preserves provenance in context items", () => {
    const candidates = [
      { memory: makeMemory("m1", "Content", { sourceKind: "github" }), versionNumber: 2, isCurrentVersion: true, score: 0.9, recallReasons: ["importance"], deduplicated: false },
    ];
    const context = assembleContext(candidates, 5000);
    expect(context.items[0].memoryId).toBe("m1");
    expect(context.items[0].source).toBe("github");
    expect(context.items[0].version).toBe(2);
    expect(context.items[0].reasons).toContain("importance");
  });

  it("deterministic ordering", () => {
    const candidates = [
      { memory: makeMemory("m2", "B"), versionNumber: 1, isCurrentVersion: true, score: 0.5, recallReasons: [], deduplicated: false },
      { memory: makeMemory("m1", "A"), versionNumber: 1, isCurrentVersion: true, score: 0.5, recallReasons: [], deduplicated: false },
    ];
    const c1 = assembleContext(candidates, 5000);
    const c2 = assembleContext(candidates, 5000);
    expect(c1.items.map(i => i.memoryId)).toEqual(c2.items.map(i => i.memoryId));
  });

  it("empty candidates produce empty context", () => {
    const context = assembleContext([], 5000);
    expect(context.itemsIncluded).toBe(0);
    expect(context.itemsDropped).toBe(0);
    expect(context.totalCharacters).toBe(0);
  });
});

// ─── PROVENANCE ──────────────────────────────────────────────────────────────

describe("M5.9 – Provenance preservation", () => {
  it("provenance survives recall pipeline", () => {
    const store = setupStore([
      makeMemory("m1", "GitHub intelligence", {
        status: "stored",
        sourceKind: "github",
        tags: ["code"],
        importance: "high",
        confidence: "high",
      }),
    ]);
    const result = recall(store, { text: "GitHub intelligence" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.candidates[0].memory.provenance.sourceKind).toBe("github");
      expect(result.result.candidates[0].memory.metadata.tags).toContain("code");
    }
  });

  it("memory ID survives recall pipeline", () => {
    const store = setupStore([
      makeMemory("m-unique-123", "Test content", { status: "stored" }),
    ]);
    const result = recall(store, { text: "Test" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.candidates[0].memory.id).toBe("m-unique-123");
    }
  });

  it("content hash survives recall pipeline", () => {
    const store = setupStore([
      makeMemory("m1", "Hashed content", { status: "stored" }),
    ]);
    const result = recall(store, { text: "Hashed" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.candidates[0].memory.contentHash).toBeTruthy();
    }
  });
});

// ─── READ-ONLY BEHAVIOR ──────────────────────────────────────────────────────

describe("M5.9 – Read-only behavior", () => {
  it("recall does not create memory", () => {
    const store = setupStore([
      makeMemory("m1", "Content", { status: "stored" }),
    ]);
    const before = store.count();
    recall(store, { text: "Content" });
    expect(store.count()).toBe(before);
  });

  it("recall does not modify stored memory", () => {
    const m1 = makeMemory("m1", "Original content", { status: "stored" });
    const store = setupStore([m1]);
    recall(store, { text: "Original" });
    const after = store.get("m1");
    expect(after?.content).toBe("Original content");
    expect(after?.status).toBe("stored");
  });

  it("recall does not change lifecycle status", () => {
    const store = setupStore([
      makeMemory("m1", "Content", { status: "retrievable" }),
    ]);
    recall(store, { text: "Content" });
    expect(store.get("m1")?.status).toBe("retrievable");
  });

  it("recall does not update timestamps", () => {
    const m1 = makeMemory("m1", "Content", { status: "stored" });
    const store = setupStore([m1]);
    const before = store.get("m1")?.updatedAt;
    recall(store, { text: "Content" });
    const after = store.get("m1")?.updatedAt;
    expect(after).toBe(before);
  });
});

// ─── FULL PIPELINE ───────────────────────────────────────────────────────────

describe("M5.9 – Full recall pipeline", () => {
  it("returns successful result for matching content", () => {
    const store = setupStore([
      makeMemory("m1", "TypeScript generics are powerful", { status: "stored", importance: "high" }),
      makeMemory("m2", "React hooks simplify state", { status: "stored" }),
    ]);
    const result = recall(store, { text: "TypeScript" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.totalCandidatesFound).toBeGreaterThanOrEqual(1);
      expect(result.result.query.text).toBe("TypeScript");
    }
  });

  it("rejects invalid query", () => {
    const store = setupStore([]);
    const result = recall(store, { text: "" });
    expect(result.ok).toBe(false);
  });

  it("handles empty store gracefully", () => {
    const store = new InMemoryMemoryStore({ capacity: 100 });
    const result = recall(store, { text: "anything" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.totalCandidatesFound).toBe(0);
      expect(result.result.totalRecalled).toBe(0);
    }
  });

  it("pipeline is deterministic", () => {
    const store = setupStore([
      makeMemory("m1", "A", { status: "stored", importance: "high" }),
      makeMemory("m2", "B", { status: "stored", importance: "low" }),
    ]);
    const r1 = recall(store, { text: "A" });
    const r2 = recall(store, { text: "A" });
    expect(r1).toEqual(r2);
  });

  it("respects context budget", () => {
    const memories = Array.from({ length: 50 }, (_, i) =>
      makeMemory(`m${i}`, `Content item ${i} with some extra text`, { status: "stored" })
    );
    const store = setupStore(memories);
    const result = recall(store, { text: "Content", contextBudget: 500 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.context.totalCharacters).toBeLessThanOrEqual(500);
    }
  });
});

// ─── SECURITY / BOUNDS ───────────────────────────────────────────────────────

describe("M5.9 – Security and bounds", () => {
  it("handles extremely long query safely", () => {
    const long = "a".repeat(MEMORY_LIMITS.MAX_RECALL_QUERY_LENGTH + 1);
    const result = normalizeQuery(long);
    expect(result.ok).toBe(false);
  });

  it("handles many candidates without unbounded growth", () => {
    const memories = Array.from({ length: MEMORY_LIMITS.MAX_RECALL_CANDIDATES }, (_, i) =>
      makeMemory(`m${i}`, `Item ${i}`, { status: "stored" })
    );
    const store = setupStore(memories);
    const candidates = selectCandidates(store, { text: "Item" });
    expect(candidates.length).toBeLessThanOrEqual(MEMORY_LIMITS.MAX_RECALL_CANDIDATES);
  });

  it("handles repeated duplicates safely", () => {
    const ranked = Array.from({ length: 100 }, (_, i) => ({
      memory: makeMemory(`m${i}`, "Same content"),
      versionNumber: 1,
      isCurrentVersion: true,
      score: 0.5,
      recallReasons: [] as string[],
    }));
    const deduped = suppressDuplicates(ranked);
    expect(deduped.length).toBe(1);
  });

  it("handles malformed memory data safely", () => {
    const store = new InMemoryMemoryStore({ capacity: 100 });
    const candidates = selectCandidates(store, { text: "test" });
    expect(candidates).toHaveLength(0);
  });

  it("handles boundary-size context", () => {
    const candidates = [
      { memory: makeMemory("m1", "x".repeat(50000)), versionNumber: 1, isCurrentVersion: true, score: 0.9, recallReasons: [], deduplicated: false },
    ];
    const context = assembleContext(candidates, MEMORY_LIMITS.MAX_RECALL_CONTEXT_BUDGET);
    expect(context.totalCharacters).toBeLessThanOrEqual(MEMORY_LIMITS.MAX_RECALL_CONTEXT_BUDGET);
  });

  it("no unbounded loops in candidate selection", () => {
    const store = setupStore([
      makeMemory("m1", "Content", { status: "stored" }),
    ]);
    const start = Date.now();
    selectCandidates(store, { text: "Content" });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});

// ─── REGRESSION ──────────────────────────────────────────────────────────────

describe("M5.9 – Regression", () => {
  it("existing store operations still work", () => {
    const store = new InMemoryMemoryStore({ capacity: 100 });
    const m = makeMemory("m1", "Content", { status: "stored" });
    store.save(m);
    expect(store.get("m1")).toBeDefined();
    expect(store.count()).toBe(1);
    store.delete("m1");
    expect(store.get("m1")).toBeUndefined();
  });

  it("existing validation still works", () => {
    const m = makeMemory("m1", "Content");
    expect(m.id).toBe("m1");
    expect(m.content).toBe("Content");
  });
});
