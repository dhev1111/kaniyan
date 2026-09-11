/**
 * M5.5 – MemoryStore contract.
 * Provider-independent interface so persistence implementations (in-memory,
 * filesystem, database) can evolve without changing the memory domain.
 */

import type { MemoryReference } from "../types";
import type { MemoryListFilter, RestoreResult, MemorySnapshot } from "./types";

export interface MemoryStore {
  /** Saves a new record; throws on duplicate ID. */
  save(memory: MemoryReference): MemoryReference;
  /** Retrieves a record by ID; returns undefined when missing. */
  get(id: string): MemoryReference | undefined;
  /** Replaces an existing record (upsert semantics). */
  upsert(memory: MemoryReference): MemoryReference;
  /** Deletes a record by ID; returns true if it existed. */
  delete(id: string): boolean;
  /** Lists records matching the filter, sorted deterministically. */
  list(filter?: MemoryListFilter): MemoryReference[];
  /** Returns the number of stored records. */
  count(): number;
  /** Removes all records. */
  clear(): void;
  /** Creates a portable, schema-versioned snapshot of the store. */
  snapshot(): MemorySnapshot;
  /** Restores from a snapshot; validates before committing atomically. */
  restore(snapshot: MemorySnapshot): RestoreResult;
  /** The configured capacity limit. */
  readonly capacity: number;
}
