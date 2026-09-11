/**
 * M5.4 – Retrieval abstractions barrel.
 */

export type {
  RetrievalErrorCode,
  RetrievalFilter,
  RetrievalRequest,
  RetrievalResult,
} from "./types";

export {
  validateRetrievalFilter,
  validateRetrievalRequest,
  assertRetrievalRequest,
  RetrievalValidationError,
  retrievalLimits,
} from "./validation";

import { RetrievalValidationError, type RetrievalIssue } from "./validation";

export interface RetrievalErrorPair {
  code: string;
  message: string;
}

export function retrievalErrorMessage(error: unknown): RetrievalErrorPair {
  if (error instanceof RetrievalValidationError) {
    const detail = error.issues
      .map((entry: RetrievalIssue) => `${entry.path}: ${entry.message}`)
      .join("; ");
    return { code: error.code, message: detail };
  }
  if (error instanceof Error) {
    return { code: "unknown", message: error.message };
  }
  return { code: "unknown", message: String(error) };
}

export type {
  RetrievalIssue,
  RetrievalReport,
} from "./validation";

export {
  applyMinimumSimilarity,
  applyMetadataFilter,
  applyMemoryFilters,
  rankRetrievalResults,
  copyMemory,
} from "./ranking";

export {
  MemoryRetriever,
} from "./retriever";

export type {
  MemoryRetrieverOptions,
} from "./retriever";