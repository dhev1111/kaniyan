/**
 * M5.3 – Embedding abstractions barrel.
 */

export type {
  EmbeddingVector,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingExport,
} from "./types";

export {
  maxEmbeddingDimensions,
  maxEmbeddingBatchSize,
} from "./types";

export {
  validateEmbeddingVector,
  validateEmbeddingRequest,
  assertEmbeddingVector,
  assertEmbeddingRequest,
  assertEmbeddingDimension,
  clampEmbeddingBatch,
  EmbeddingValidationError,
} from "./validation";

export type {
  EmbeddingIssue,
  EmbeddingReport,
} from "./validation";

export {
  DeterministicEmbeddingProvider,
  maxEmbeddingTextChars,
} from "./provider";

export type {
  EmbeddingProvider,
  DeterministicEmbeddingOptions,
} from "./provider";