/**
 * M5.3 – Bounded in-memory vector index.
 * Deterministic, dimension-fixed, capacity-bounded and defensive: stored
 * vectors/metadata are copied so callers can never mutate index state, and
 * search ordering is stable (score desc, then id asc).
 */

import { clamp } from "../util";
import { cosineSimilarity, compareVectorResults } from "./similarity";
import type { VectorIndex } from "./contract";
import {
  assertValidDimension,
  assertVectorDimensionMatches,
  assertVectorId,
  assertVectorRecord,
  assertVectorValue,
  clampIndexCapacity,
  resolveTopK,
  VectorDuplicateIdError,
  VectorIndexCapacityError,
} from "./validation";
import type {
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
} from "./types";

export interface InMemoryVectorIndexOptions {
  dimensions: number;
  capacity?: number;
}

function copyRecord(record: VectorRecord): VectorRecord {
  return {
    id: record.id,
    vector: record.vector.slice(),
    metadata: record.metadata ? { ...record.metadata } : undefined,
  };
}

export class InMemoryVectorIndex implements VectorIndex {
  readonly dimensions: number;
  readonly capacity: number;
  private readonly entries = new Map<string, VectorRecord>();

  constructor(options: InMemoryVectorIndexOptions) {
    this.dimensions = assertValidDimension(options.dimensions);
    this.capacity = clampIndexCapacity(options.capacity);
  }

  add(record: VectorRecord): VectorRecord {
    const validated = assertVectorRecord(record);
    assertVectorDimensionMatches(validated.vector, this.dimensions);
    const id = assertVectorId(validated.id);
    if (this.entries.has(id)) {
      throw new VectorDuplicateIdError(id);
    }
    if (this.entries.size >= this.capacity) {
      throw new VectorIndexCapacityError(this.capacity);
    }
    const stored = copyRecord(validated);
    this.entries.set(id, stored);
    return copyRecord(stored);
  }

  upsert(record: VectorRecord): VectorRecord {
    const validated = assertVectorRecord(record);
    assertVectorDimensionMatches(validated.vector, this.dimensions);
    const id = assertVectorId(validated.id);
    if (!this.entries.has(id) && this.entries.size >= this.capacity) {
      throw new VectorIndexCapacityError(this.capacity);
    }
    const stored = copyRecord(validated);
    this.entries.set(id, stored);
    return copyRecord(stored);
  }

  get(idValue: string): VectorRecord | undefined {
    const id = assertVectorId(idValue);
    const found = this.entries.get(id);
    return found ? copyRecord(found) : undefined;
  }

  remove(idValue: string): boolean {
    const id = assertVectorId(idValue);
    return this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  count(): number {
    return this.entries.size;
  }

  search(vectorValue: number[], options: VectorSearchOptions = {}): VectorSearchResult[] {
    const vector = assertVectorValue(vectorValue, "query vector");
    assertVectorDimensionMatches(vector, this.dimensions);
    const topK = resolveTopK(options.topK);
    const allowed =
      options.ids === undefined
        ? undefined
        : new Set<string>(options.ids.map((candidate) => assertVectorId(candidate)));

    const scored: VectorSearchResult[] = [];
    for (const [id, record] of this.entries) {
      if (allowed !== undefined && !allowed.has(id)) continue;
      scored.push({
        id,
        score: cosineSimilarity(vector, record.vector),
        metadata: record.metadata ? { ...record.metadata } : undefined,
      });
    }
    scored.sort(compareVectorResults);
    const best = scored.slice(0, clamp(topK, 1, scored.length));
    return best.map((entry) => ({
      id: entry.id,
      score: entry.score,
      metadata: entry.metadata ? { ...entry.metadata } : undefined,
    }));
  }
}

/** Deterministic all-zero vector used by tests and capability probing. */
export function zeroVector(dimensions: number): number[] {
  const validated = assertValidDimension(dimensions);
  return new Array<number>(validated).fill(0);
}