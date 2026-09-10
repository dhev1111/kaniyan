/**
 * M5.3 – Provider-independent vector index contract.
 * Any backend (in-memory now, persistent stores later) implements this so
 * retrieval and consolidation milestones never bind to a vendor.
 */

import type {
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
} from "./types";

export interface VectorIndex {
  /** Fixed dimension enforced for every stored and searched vector. */
  readonly dimensions: number;
  /** Maximum number of stored entries. */
  readonly capacity: number;

  add(record: VectorRecord): VectorRecord;
  /** Replaces an existing ID with new vector/metadata (deterministic upsert). */
  upsert(record: VectorRecord): VectorRecord;
  get(id: string): VectorRecord | undefined;
  remove(id: string): boolean;
  clear(): void;
  count(): number;
  search(vector: number[], options?: VectorSearchOptions): VectorSearchResult[];
}