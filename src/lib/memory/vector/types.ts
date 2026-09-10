/**
 * M5.3 – Vector index domain types.
 * Provider-independent vocabulary for storage and search.
 */

export interface VectorMetadataEntry {
  key: string;
  value: string;
}

/** Bounded key/value metadata attached to a stored vector. */
export type VectorMetadata = Record<string, string>;

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata?: VectorMetadata;
}

export interface VectorSearchOptions {
  topK?: number;
  /** Restrict search to these IDs when provided (bounded by ID count). */
  ids?: string[];
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: VectorMetadata;
}

/** Standardized error codes surfaced by vector indexes. */
export type VectorErrorCode =
  | "invalid-vector"
  | "invalid-dimension"
  | "dimension-mismatch"
  | "invalid-id"
  | "duplicate-id"
  | "invalid-topk"
  | "index-capacity";