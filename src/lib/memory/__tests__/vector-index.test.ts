/**
 * M5.3 – Vector index: cosine similarity, ordering, and the bounded
 * in-memory implementation.
 */

import { InMemoryVectorIndex, zeroVector } from "../vector/in-memory";
import {
  cosineSimilarity,
  compareVectorResults,
  compareIds,
} from "../vector/similarity";
import {
  EmbeddingValidationError,
} from "../embedding/validation";
import {
  VectorValidationError,
  VectorDuplicateIdError,
  VectorIndexCapacityError,
  resolveTopK,
} from "../vector/validation";
import { MEMORY_LIMITS } from "../limits";
import type {
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
} from "../vector/types";

function record(id: string, values: number[], metadata?: Record<string, string>): VectorRecord {
  return { id, vector: values, metadata };
}

describe("M5.3 cosine similarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("computes known cosine values", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBe(1);
    const score = cosineSimilarity([2, 0, 0], [1, 1, 0]);
    expect(score).toBeCloseTo(Math.SQRT1_2, 6);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
  });

  it("handles zero-magnitude vectors safely (returns 0, never NaN)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("rejects dimension mismatch without truncation", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(EmbeddingValidationError);
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(EmbeddingValidationError);
  });

  it("rejects empty and non-finite vectors", () => {
    expect(() => cosineSimilarity([], [1])).toThrow(EmbeddingValidationError);
    expect(() => cosineSimilarity([1], [])).toThrow(EmbeddingValidationError);
    expect(() => cosineSimilarity([Number.NaN, 1], [1, 1])).toThrow(EmbeddingValidationError);
    expect(() => cosineSimilarity([1, Number.POSITIVE_INFINITY], [1, 1])).toThrow(
      EmbeddingValidationError
    );
  });

  it("orders equal scores by stable ID ascending", () => {
    const results: VectorSearchResult[] = [
      { id: "mem-b", score: 0.5 },
      { id: "mem-a", score: 0.5 },
      { id: "mem-c", score: 0.9 },
    ];
    const ordered = [...results].sort(compareVectorResults);
    expect(ordered.map((entry) => entry.id)).toEqual(["mem-c", "mem-a", "mem-b"]);
    expect(compareIds("a", "b")).toBe(-1);
    expect(compareIds("b", "a")).toBe(1);
    expect(compareIds("a", "a")).toBe(0);
  });
});

describe("M5.3 in-memory vector index", () => {
  function index(capacity?: number): InMemoryVectorIndex {
    return new InMemoryVectorIndex({ dimensions: 3, capacity });
  }

  it("adds and searches deterministically", () => {
    const store = index();
    store.add(record("a", [1, 0, 0]));
    store.add(record("b", [0, 1, 0]));
    store.add(record("c", [1, 1, 0]));
    expect(store.count()).toBe(3);

    const results = store.search([1, 0, 0]);
    expect(results[0].id).toBe("a");
    expect(results[0].score).toBe(1);
    expect(results[1].id).toBe("c");
    expect(Number.isFinite(results[1].score)).toBe(true);
  });

  it("upserts an existing ID deterministically", () => {
    const store = index();
    store.add(record("a", [1, 0, 0]));
    store.upsert(record("a", [0, 1, 0], { tag: "updated" }));
    expect(store.count()).toBe(1);
    const found = store.get("a");
    expect(found?.vector).toEqual([0, 1, 0]);
    expect(found?.metadata).toEqual({ tag: "updated" });
  });

  it("rejects duplicate add with a typed duplicate-id error", () => {
    const store = index();
    store.add(record("a", [1, 0, 0]));
    expect(() => store.add(record("a", [0, 1, 0]))).toThrow(VectorDuplicateIdError);
    expect(store.count()).toBe(1);
  });

  it("removes IDs so they no longer appear in search", () => {
    const store = index();
    store.add(record("a", [1, 0, 0]));
    store.add(record("b", [0, 1, 0]));
    expect(store.remove("a")).toBe(true);
    expect(store.remove("a")).toBe(false);
    expect(store.get("a")).toBeUndefined();
    const results = store.search([1, 0, 0]);
    expect(results.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("clears fully and resets count", () => {
    const store = index();
    store.add(record("a", [1, 0, 0]));
    store.add(record("b", [0, 1, 0]));
    store.clear();
    expect(store.count()).toBe(0);
    expect(store.search([1, 0, 0])).toEqual([]);
  });

  it("counts entries only", () => {
    const store = index();
    store.add(record("a", [1, 0, 0]));
    store.upsert(record("a", [0, 1, 0]));
    expect(store.count()).toBe(1);
  });

  it("respects topK and clamps oversized topK to the central cap", () => {
    const store = index();
    for (let id = 0; id < 150; id += 1) {
      store.add(record(`mem-${String(id)}`, [id % 2, 1, 0]));
    }
    const small = store.search([1, 1, 0], { topK: 5 });
    expect(small.length).toBe(5);

    const maxed = store.search([1, 1, 0], { topK: 1_000_000 });
    expect(maxed.length).toBeLessThanOrEqual(MEMORY_LIMITS.MAX_VECTOR_SEARCH_TOP_K);
    expect(maxed).toEqual(store.search([1, 1, 0], { topK: MEMORY_LIMITS.MAX_VECTOR_SEARCH_TOP_K }));
    expect(resolveTopK(undefined)).toBe(MEMORY_LIMITS.DEFAULT_VECTOR_SEARCH_TOP_K);
  });

  it("rejects invalid topK values", () => {
    const store = index();
    store.add(record("a", [1, 0, 0]));
    expect(() => store.search([1, 0, 0], { topK: 0 })).toThrow(VectorValidationError);
    expect(() => store.search([1, 0, 0], { topK: -1 })).toThrow(VectorValidationError);
    expect(() => store.search([1, 0, 0], { topK: 2.5 })).toThrow(VectorValidationError);
    expect(() => store.search([1, 0, 0], { topK: Number.NaN })).toThrow(VectorValidationError);
  });

  it("enforces the capacity bound", () => {
    const store = index(2);
    store.add(record("a", [1, 0, 0]));
    store.add(record("b", [0, 1, 0]));
    expect(() => store.add(record("c", [0, 0, 1]))).toThrow(VectorIndexCapacityError);
    store.upsert(record("b", [1, 1, 1]));
    expect(() => store.upsert(record("c", [0, 0, 1]))).toThrow(VectorIndexCapacityError);
  });

  it("copies defensively so callers cannot mutate stored state", () => {
    const store = index();
    const caller = [1, 2, 3];
    store.add(record("a", caller, { owner: "test" }));
    caller.push(4);
    caller[0] = 99;

    const returned = store.get("a");
    expect(returned?.vector).toEqual([1, 2, 3]);
    expect(returned?.metadata).toEqual({ owner: "test" });

    returned?.vector.push(5);
    const again = store.get("a");
    expect(again?.vector).toEqual([1, 2, 3]);

    const probe = store.search([1, 2, 3]);
    expect(probe[0].metadata).toEqual({ owner: "test" });
    if (probe[0].metadata) probe[0].metadata.owner = "mutated";
    expect(store.get("a")?.metadata?.owner).toBe("test");
  });

  it("returns an empty result set on an empty index deterministically", () => {
    const store = index();
    expect(store.search([1, 0, 0])).toEqual([]);
    expect(store.search(zeroVector(3))).toEqual([]);
    expect(store.count()).toBe(0);
  });

  it("rejects malformed inputs with typed errors", () => {
    const store = index();
    expect(() => store.add(record("a", []))).toThrow(VectorValidationError);
    expect(() => store.add(record("", [1, 0, 0]))).toThrow(VectorValidationError);
    expect(() => store.add(record("a", [1, 0, 0, 4]))).toThrow(VectorValidationError);
    expect(() => store.add(record("a", [Number.NaN, 0, 0]))).toThrow(VectorValidationError);
    expect(() => store.search([1, 2])).toThrow(VectorValidationError);
    expect(() => new InMemoryVectorIndex({ dimensions: 0 })).toThrow(VectorValidationError);
    expect(() => new InMemoryVectorIndex({ dimensions: 2.5 })).toThrow(VectorValidationError);
  });

  it("rejects malformed and oversized metadata deterministically", () => {
    const store = index();
    expect(() => store.add(record("a", [1, 0, 0], { x: "ok" }))).not.toThrow();
    expect(() =>
      store.add(record("c", [1, 0, 0], { ["k".repeat(65)]: "v" }))
    ).toThrow(VectorValidationError);
    expect(() =>
      store.add(record("d", [1, 0, 0], { k: "v".repeat(257) }))
    ).toThrow(VectorValidationError);
    const tooMany: Record<string, string> = {};
    for (let key = 0; key < MEMORY_LIMITS.MAX_VECTOR_METADATA_KEYS + 1; key += 1) {
      tooMany[`k${key}`] = "v";
    }
    expect(() => store.add(record("e", [1, 0, 0], tooMany))).toThrow(VectorValidationError);
  });

  it("supports restricted-ID search", () => {
    const store = index();
    store.add(record("a", [1, 0, 0], { tag: "x" }));
    store.add(record("b", [0, 1, 0], { tag: "y" }));
    const options: VectorSearchOptions = { ids: ["b"] };
    const results = store.search([1, 0, 0], options);
    expect(results.map((entry) => entry.id)).toEqual(["b"]);
    expect(results[0].metadata).toEqual({ tag: "y" });
  });

  it("produces deterministic ordering across repeated searches", () => {
    const store = index();
    for (let index = 0; index < 20; index += 1) {
      store.add(record(`mem-${String(index).padStart(3, "0")}`, [index % 5, 1, 0]));
    }
    const query = [1, 1, 0];
    const first = store.search(query, { topK: 20 }).map((entry) => entry.id);
    const second = store.search(query, { topK: 20 }).map((entry) => entry.id);
    expect(first).toEqual(second);
  });

  it("exposes fixed dimension and capacity", () => {
    const store = new InMemoryVectorIndex({ dimensions: 7, capacity: 42 });
    expect(store.dimensions).toBe(7);
    expect(store.capacity).toBe(42);
    expect(zeroVector(7)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});