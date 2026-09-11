/**
 * M5.4 – Retrieval domain types.
 * Declarative, bounded requests and deterministic ranked results. The
 * retriever never trusts executable predicates from user data: everything
 * here is data the retrieval layer interprets safely.
 */

import type {
  MemoryReference,
  MemoryScope,
  MemorySourceKind,
} from "../types";
import type { VectorMetadata } from "../vector/types";

export interface RetrievalFilter {
  ids?: string[];
  metadata?: VectorMetadata;
  scopes?: MemoryScope[];
  sourceKinds?: MemorySourceKind[];
  projectIds?: string[];
  tags?: string[];
}

export interface RetrievalRequest {
  /** Exact query vector (mutually exclusive with `text`). */
  vector?: number[];
  /** Query text embedded via the configured provider (or `vector`). */
  text?: string;
  topK?: number;
  /** Minimum similarity in 0..1; results below it are discarded. */
  minSimilarity?: number;
  filter?: RetrievalFilter;
}

export interface RetrievalResult {
  /** Stable memory/vector ID. */
  id: string;
  /** Deterministic cosine similarity in [-1, 1]. */
  score: number;
  /** 1-based rank after stable (score desc, id asc) ordering. */
  rank: number;
  metadata?: VectorMetadata;
  /** Resolved memory reference copy when a resolver is configured. */
  memory?: MemoryReference;
}

export type RetrievalErrorCode =
  | "invalid-vector"
  | "invalid-query"
  | "invalid-topk"
  | "invalid-threshold"
  | "invalid-filter"
  | "dimension-mismatch"
  | "provider-required"
  | "resolver-required";