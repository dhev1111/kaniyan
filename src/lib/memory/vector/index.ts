/**
 * M5.3 – Vector index abstractions barrel and provider-independent contract.
 * Any backend (in-memory now, persistent stores later) implements this so
 * retrieval and consolidation milestones never bind to a vendor.
 */

/** Provider-independent vector index contract. */
export type { VectorIndex } from "./contract";

export type {
  VectorMetadata,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
  VectorErrorCode,
} from "./types";

export {
  cosineSimilarity,
  compareIds,
  compareVectorResults,
} from "./similarity";

export {
  VectorValidationError,
  VectorIndexCapacityError,
  VectorDuplicateIdError,
  assertValidDimension,
  assertVectorValue,
  assertVectorDimensionMatches,
  assertVectorId,
  validateVectorMetadata,
  assertVectorRecord,
  resolveTopK,
  clampIndexCapacity,
} from "./validation";

export {
  InMemoryVectorIndex,
  zeroVector,
} from "./in-memory";

export type { InMemoryVectorIndexOptions } from "./in-memory";