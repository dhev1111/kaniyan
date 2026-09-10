/**
 * M5.3 – Embedding domain types.
 * Zero knowledge of any embedding vendor: vectors, requests and responses
 * only carry the data the memory subsystem needs.
 */

import { MEMORY_LIMITS } from "../limits";

/** A dense embedding vector. All values must be finite numbers. */
export type EmbeddingVector = number[];

export interface EmbeddingRequest {
  text: string;
}

export interface EmbeddingResponse {
  /** The embedding vector (always a fresh, fully-owned array). */
  vector: EmbeddingVector;
  /** Provider/model identifier that produced the vector. */
  model: string;
}

export interface EmbeddingExport {
  providerId: string;
  dimensions: number;
  description: string;
}

export function maxEmbeddingDimensions(): number {
  return MEMORY_LIMITS.MAX_VECTOR_DIMENSIONS;
}

export function maxEmbeddingBatchSize(): number {
  return MEMORY_LIMITS.MAX_EMBEDDING_BATCH;
}