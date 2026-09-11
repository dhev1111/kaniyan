/**
 * M5.5 – Bounded in-memory memory store.
 * Deterministic, capacity-bounded, defensive: stored memories are always
 * copied so callers can never mutate index state.
 */

import {
  assertStoreId,
  assertStoreRecord,
  clampStoreCapacity,
  compareMemoryRecords,
  copyMemoryReference,
  matchesFilter,
  MemoryStoreError,
} from "./validation";
import type { MemoryReference } from "../types";
import type { MemoryStore } from "./store";
import type { MemoryListFilter, MemorySnapshot, RestoreResult } from "./types";
import { restoreSnapshot } from "./snapshot";

export class InMemoryMemoryStore implements MemoryStore {
  readonly capacity: number;
  private readonly entries = new Map<string, MemoryReference>();

  constructor(options: { capacity?: number } = {}) {
    this.capacity = clampStoreCapacity(options.capacity);
  }

  save(memory: MemoryReference): MemoryReference {
    assertStoreRecord(memory);
    const id = assertStoreId(memory.id);
    if (this.entries.has(id)) {
      throw new MemoryStoreError("duplicate-id", `memory "${id}" already exists; use upsert to replace`);
    }
    if (this.entries.size >= this.capacity) {
      throw new MemoryStoreError("capacity-exceeded", `store is full (capacity ${this.capacity})`);
    }
    const stored = copyMemoryReference(memory);
    this.entries.set(id, stored);
    return copyMemoryReference(stored);
  }

  get(idValue: string): MemoryReference | undefined {
    const id = assertStoreId(idValue);
    const found = this.entries.get(id);
    return found ? copyMemoryReference(found) : undefined;
  }

  upsert(memory: MemoryReference): MemoryReference {
    assertStoreRecord(memory);
    const id = assertStoreId(memory.id);
    if (!this.entries.has(id) && this.entries.size >= this.capacity) {
      throw new MemoryStoreError("capacity-exceeded", `store is full (capacity ${this.capacity})`);
    }
    const stored = copyMemoryReference(memory);
    this.entries.set(id, stored);
    return copyMemoryReference(stored);
  }

  delete(idValue: string): boolean {
    const id = assertStoreId(idValue);
    return this.entries.delete(id);
  }

  list(filter?: MemoryListFilter): MemoryReference[] {
    let results: MemoryReference[];
    if (filter) {
      results = [];
      for (const memory of this.entries.values()) {
        if (matchesFilter(memory, filter)) {
          results.push(copyMemoryReference(memory));
        }
      }
    } else {
      results = [];
      for (const memory of this.entries.values()) {
        results.push(copyMemoryReference(memory));
      }
    }
    results.sort(compareMemoryRecords);
    return results;
  }

  count(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  snapshot(): MemorySnapshot {
    const entries = this.list().map((memory) => ({
      schema: "kaniyan/memory@1",
      memory: copyMemoryReference(memory) as unknown as Record<string, unknown>,
    }));
    return {
      version: "kaniyan/memory@1",
      entries,
      createdAt: new Date().toISOString(),
    };
  }

  restore(snapshot: MemorySnapshot): RestoreResult {
    return restoreSnapshot(snapshot, this);
  }

  /** Internal: adds a record without capacity checks (used by restore). */
  _internalAdd(memory: MemoryReference): void {
    this.entries.set(memory.id, copyMemoryReference(memory));
  }

  /** Internal: returns true if the id exists. */
  _has(id: string): boolean {
    return this.entries.has(id);
  }
}