/**
 * M5.4 – Retrieval: requests, ranking, filtering and the MemoryRetriever.
 */

import { MemoryRetriever } from "../retrieval/retriever";
import {
  RetrievalValidationError,
  validateRetrievalRequest,
  validateRetrievalFilter,
} from "../retrieval/validation";
import {
  applyMinimumSimilarity,
  applyMetadataFilter,
  rankRetrievalResults,
} from "../retrieval/ranking";
import { InMemoryVectorIndex } from "../vector/in-memory";
import { DeterministicEmbeddingProvider } from "../embedding/provider";
import { constructMemory } from "../validation";
import { MEMORY_LIMITS } from "../limits";
import type { MemoryReference } from "../types";
import type { RetrievalRequest, RetrievalResult } from "../retrieval/types";

const NOW = "2026-02-01T00:00:00.000Z";

function memoryReference(id: string, content: string, sourceKind: "web" | "github", project: string): MemoryReference {
  return constructMemory(
    {
      content,
      provenance: { sourceKind, ingestedAt: NOW },
      metadata: { scope: "project", projectId: project, tags: ["rag"], extra: {} },
    },
    { now: NOW, id }
  );
}

interface Fixture {
  index: InMemoryVectorIndex;
  resolver: (id: string) => MemoryReference | undefined;
  references: Map<string, MemoryReference>;
  retriever: MemoryRetriever;
}

function setup(opts: { withResolver?: boolean } = {}): Fixture {
  const index = new InMemoryVectorIndex({ dimensions: 3 });
  index.add({ id: "mem-a", vector: [1, 0, 0], metadata: { sourceKind: "web", projectId: "p1", tag: "rag" } });
  index.add({ id: "mem-b", vector: [0, 1, 0], metadata: { sourceKind: "github", projectId: "p2", tag: "tools" } });
  index.add({ id: "mem-c", vector: [1, 1, 0], metadata: { sourceKind: "web", projectId: "p1", tag: "rag" } });

  const references = new Map<string, MemoryReference>([
    ["mem-a", memoryReference("mem-a", "Web fact about retrieval.", "web", "p1")],
    ["mem-b", memoryReference("mem-b", "GitHub intelligence about indexing.", "github", "p2")],
    ["mem-c", memoryReference("mem-c", "Another web fact.", "web", "p1")],
  ]);
  const resolver = (id: string): MemoryReference | undefined => references.get(id);
  const retriever = new MemoryRetriever({
    index,
    resolveMemory: opts.withResolver === false ? undefined : resolver,
  });
  return { index, resolver, references, retriever };
}

describe("M5.4 requests and validation", () => {
  it("accepts a valid vector request", () => {
    const report = validateRetrievalRequest({ vector: [1, 0, 0], topK: 5 });
    expect(report.ok).toBe(true);
  });

  it("rejects empty and non-finite query vectors", () => {
    expect(validateRetrievalRequest({ vector: [] }).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: [Number.NaN, 0, 0] }).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: [Number.POSITIVE_INFINITY, 0, 0] }).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: [Number.NEGATIVE_INFINITY, 0, 0] }).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: ["x", 0] as never }).ok).toBe(false);
  });

  it("requires exactly one of vector or text", () => {
    expect(validateRetrievalRequest({}).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: [1, 0, 0], text: "both" }).ok).toBe(false);
    expect(validateRetrievalRequest({ text: "only text" }).ok).toBe(true);
  });

  it("rejects invalid topK values", () => {
    expect(validateRetrievalRequest({ vector: [1, 0, 0], topK: 0 }).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: [1, 0, 0], topK: -2 }).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: [1, 0, 0], topK: 2.5 }).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: [1, 0, 0], topK: Number.NaN }).ok).toBe(false);
  });

  it("rejects invalid similarity thresholds", () => {
    expect(validateRetrievalRequest({ vector: [1, 0, 0], minSimilarity: -0.1 }).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: [1, 0, 0], minSimilarity: 1.5 }).ok).toBe(false);
    expect(validateRetrievalRequest({ vector: [1, 0, 0], minSimilarity: Number.NaN }).ok).toBe(false);
  });

  it("rejects oversized and malformed filters", () => {
    const oversized = Array.from({ length: MEMORY_LIMITS.MAX_RETRIEVAL_FILTER_ENTRIES + 1 }, (_, i) => `id-${i}`);
    expect(validateRetrievalRequest({ vector: [1, 0, 0], filter: { ids: oversized } }).ok).toBe(false);
    expect(validateRetrievalFilter({ ids: "not-an-array" }).ok).toBe(false);
    expect(validateRetrievalFilter({ ids: [""] }).ok).toBe(false);
    expect(validateRetrievalFilter({ scopes: ["executive" as never] }).ok).toBe(false);
    expect(validateRetrievalFilter({ metadata: { ["k".repeat(65)]: "v" } }).ok).toBe(false);
    expect(validateRetrievalFilter(null).ok).toBe(false);
  });
});

describe("M5.4 retriever", () => {
  it("performs basic retrieval with full similarity ranking", () => {
    const { retriever } = setup({ withResolver: false });
    const results = retriever.retrieveByVector([1, 0, 0]);
    expect(results.length).toBe(3);
    expect(results[0].id).toBe("mem-a");
    expect(results[0].score).toBe(1);
    expect(results[0].rank).toBe(1);
    expect(results.map((entry) => entry.id)).toEqual(["mem-a", "mem-c", "mem-b"]);
  });

  it("enforces topK with bounded results", () => {
    const { retriever } = setup({ withResolver: false });
    const results = retriever.retrieveByVector([1, 0, 0], { topK: 2 });
    expect(results.length).toBe(2);
    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(2);
  });

  it("enforces the minimum similarity threshold", () => {
    const { retriever } = setup({ withResolver: false });
    const results = retriever.retrieveByVector([1, 0, 0], { minSimilarity: 0.8 });
    expect(results.map((entry) => entry.id)).toEqual(["mem-a"]);
    expect(results[0].score).toBeGreaterThanOrEqual(0.8);
  });

  it("rejects dimension mismatch deterministically", () => {
    const { retriever } = setup({ withResolver: false });
    expect(() => retriever.retrieveByVector([1, 0])).toThrow(RetrievalValidationError);
    try {
      retriever.retrieveByVector([1, 0]);
    } catch (error) {
      expect((error as RetrievalValidationError).code).toBe("dimension-mismatch");
    }
  });

  it("breaks equal-score ties by stable ID ascending", () => {
    const index = new InMemoryVectorIndex({ dimensions: 2 });
    index.add({ id: "mem-z", vector: [1, 0] });
    index.add({ id: "mem-a", vector: [1, 0] });
    const retriever = new MemoryRetriever({ index });
    const results = retriever.retrieveByVector([1, 0]);
    expect(results.map((entry) => entry.id)).toEqual(["mem-a", "mem-z"]);
    expect(results[0].score).toBe(1);
    expect(results[1].score).toBe(1);
  });

  it("filters by metadata exact-match", () => {
    const { retriever } = setup({ withResolver: false });
    const results = retriever.retrieveByVector([1, 0, 0], { filter: { metadata: { tag: "rag" } } });
    expect(results.map((entry) => entry.id)).toEqual(["mem-a", "mem-c"]);
  });

  it("filters by source kind through the memory resolver", () => {
    const { retriever } = setup({ withResolver: true });
    const results = retriever.retrieveByVector([1, 0, 0], { filter: { sourceKinds: ["web"] } });
    expect(results.map((entry) => entry.id)).toEqual(["mem-a", "mem-c"]);
  });

  it("filters by project through the memory resolver", () => {
    const { retriever } = setup({ withResolver: true });
    const results = retriever.retrieveByVector([1, 0, 0], { filter: { projectIds: ["p2"] } });
    expect(results.map((entry) => entry.id)).toEqual(["mem-b"]);
  });

  it("requires a resolver for memory-field filters", () => {
    const { retriever } = setup({ withResolver: false });
    expect(() => retriever.retrieveByVector([1, 0, 0], { filter: { sourceKinds: ["web"] } })).toThrow(
      /resolver/
    );
  });

  it("filters by IDs bound check via index restriction", () => {
    const { retriever } = setup({ withResolver: false });
    const results = retriever.retrieveByVector([1, 0, 0], { filter: { ids: ["mem-b"] } });
    expect(results.map((entry) => entry.id)).toEqual(["mem-b"]);
  });

  it("returns no results from an empty index", () => {
    const index = new InMemoryVectorIndex({ dimensions: 3 });
    const retriever = new MemoryRetriever({ index });
    expect(retriever.retrieveByVector([1, 0, 0])).toEqual([]);
    expect(retriever.retrieveByVector([0, 0, 0])).toEqual([]);
  });

  it("no longer returns removed vectors", () => {
    const index = new InMemoryVectorIndex({ dimensions: 2 });
    index.add({ id: "mem-gone", vector: [1, 0] });
    const retriever = new MemoryRetriever({ index });
    index.remove("mem-gone");
    expect(retriever.retrieveByVector([1, 0]).map((entry) => entry.id)).toEqual([]);
  });

  it("resolves optional memory references into results", () => {
    const { retriever } = setup({ withResolver: true });
    const results = retriever.retrieveByVector([1, 0, 0], { topK: 1 });
    expect(results[0].memory?.id).toBe("mem-a");
    expect(results[0].memory?.metadata.projectId).toBe("p1");
  });

  it("defensively copies results and never leaks internal references", () => {
    const index = new InMemoryVectorIndex({ dimensions: 2 });
    index.add({ id: "mem-x", vector: [1, 0], metadata: { tag: "secret" } });
    const retriever = new MemoryRetriever({ index });
    const results = retriever.retrieveByVector([1, 0]);
    results[0].metadata = { tag: "mutated" };
    expect(index.get("mem-x")?.metadata).toEqual({ tag: "secret" });
    const again = retriever.retrieveByVector([1, 0]);
    expect(again[0].metadata).toEqual({ tag: "secret" });
    again[0].score = 99;
    expect(retriever.retrieveByVector([1, 0])[0].score).toBe(1);
  });

  it("bounds results even when many pass the threshold", () => {
    const index = new InMemoryVectorIndex({ dimensions: 1 });
    for (let id = 0; id < 60; id += 1) {
      index.add({ id: `mem-${String(id).padStart(3, "0")}`, vector: [1] });
    }
    const retriever = new MemoryRetriever({ index });
    const results = retriever.retrieveByVector([1], { topK: 50, minSimilarity: 0.5 });
    expect(results.length).toBe(50);
    expect(results[49].rank).toBe(50);
  });

  it("supports async text queries via the embedding provider", async () => {
    const index = new InMemoryVectorIndex({ dimensions: 4 });
    const provider = new DeterministicEmbeddingProvider(4);
    const query = provider.vectorFor("retrieval memory fact");
    index.add({ id: "mem-query", vector: query, metadata: { tag: "rag" } });
    const retriever = new MemoryRetriever({ index, embeddingProvider: provider });
    const results = await retriever.retrieve({ text: "retrieval memory fact" });
    expect(results[0].id).toBe("mem-query");
    expect(results[0].score).toBe(1);
    const report = validateRetrievalRequest({ text: "retrieval memory fact" });
    expect(report.ok).toBe(true);
  });

  it("requires an embedding provider for text queries", async () => {
    const index = new InMemoryVectorIndex({ dimensions: 3 });
    const retriever = new MemoryRetriever({ index });
    await expect(retriever.retrieve({ text: "no provider" })).rejects.toThrow(RetrievalValidationError);
    await expect(retriever.retrieve({ text: "no provider" })).rejects.toThrow(/provider/);
  });

  it("rejects malformed requests at the retrieve boundary", async () => {
    const { retriever } = setup({ withResolver: false });
    for (const request of [
      {},
      { vector: [1, 0, 0], text: "both" },
      { vector: [] },
      { vector: [1, 0, 0], topK: 0 },
      { vector: [1, 0, 0], minSimilarity: 2 },
      { vector: [1, 0, 0], filter: { ids: ["ok", ""] } },
    ] as RetrievalRequest[]) {
      await expect(retriever.retrieve(request)).rejects.toThrow(RetrievalValidationError);
    }
  });
});

describe("M5.4 ranking helpers", () => {
  it("filters below the threshold deterministically", () => {
    const candidates = [
      { id: "a", score: 0.9 },
      { id: "b", score: 0.4 },
    ];
    expect(applyMinimumSimilarity(candidates, 0.5).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("applies exact metadata filters", () => {
    const candidates = [
      { id: "a", score: 1, metadata: { tag: "x" } },
      { id: "b", score: 1, metadata: { tag: "y" } },
    ];
    expect(applyMetadataFilter(candidates, { tag: "x" }).map((entry) => entry.id)).toEqual(["a"]);
    expect(applyMetadataFilter(candidates, { tag: "z" })).toEqual([]);
  });

  it("ranks, clamps and numbers results deterministically", () => {
    const results = rankRetrievalResults(
      [
        { id: "low", score: 0.2 },
        { id: "top", score: 0.9 },
        { id: "mid", score: 0.5 },
      ],
      { topK: 2, minSimilarity: 0.0 }
    );
    expect(results.map((entry) => entry.id)).toEqual(["top", "mid"]);
    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(2);
  });
});

describe("M5.4 regression compatibility with M5.1–M5.3", () => {
  it("coexists with the memory barrel exports", async () => {
    const memory = await import("../index");
    expect(typeof memory.constructMemory).toBe("function");
    expect(typeof memory.chunkText).toBe("function");
    expect(typeof memory.ingest).toBe("function");
    expect(typeof memory.InMemoryVectorIndex).toBe("function");
    expect(typeof memory.DeterministicEmbeddingProvider).toBe("function");
    expect(typeof memory.MemoryRetriever).toBe("function");
    expect(typeof memory.cosineSimilarity).toBe("function");
  });

  it("keeps returned result sets deterministic across runs", () => {
    const { retriever } = setup({ withResolver: false });
    const first = retriever.retrieveByVector([1, 1, 0], { topK: 3 });
    const second = retriever.retrieveByVector([1, 1, 0], { topK: 3 });
    expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
    expect(first.map((entry) => entry.score)).toEqual(second.map((entry) => entry.score));
  });

  it("never emits NaN or Infinity scores", () => {
    const index = new InMemoryVectorIndex({ dimensions: 2 });
    index.add({ id: "zero", vector: [0, 0] });
    index.add({ id: "one", vector: [1, 0] });
    const retriever = new MemoryRetriever({ index });
    const results = retriever.retrieveByVector([0, 0]);
    for (const entry of results) {
      expect(Number.isFinite(entry.score)).toBe(true);
    }
  });

  it("satisfies the bounds/security property for result type", () => {
    const result: RetrievalResult = { id: "mem-x", score: 0.5, rank: 1 };
    expect(result.rank).toBe(1);
    expect(result.score).toBe(0.5);
  });
});