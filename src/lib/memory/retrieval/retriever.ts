/**
 * M5.4 – Provider-independent memory retriever.
 * Depends only on the vector-index and embedding abstractions: validate
 * request, resolve a query vector, query the index, apply declarative
 * filters + threshold, rank deterministically, and return copies.
 */

import { assertVectorValue, assertVectorDimensionMatches, resolveTopK } from "../vector/validation";
import { EmbeddingValidationError } from "../embedding/validation";
import type { VectorIndex } from "../vector/contract";
import type { EmbeddingProvider } from "../embedding/provider";
import type { MemoryReference } from "../types";
import type {
  RetrievalErrorCode,
  RetrievalFilter,
  RetrievalRequest,
  RetrievalResult,
} from "./types";
import { assertRetrievalRequest, RetrievalValidationError, type RetrievalIssue } from "./validation";
import { applyMemoryFilters, applyMetadataFilter, copyMemory, rankRetrievalResults } from "./ranking";

export interface MemoryRetrieverOptions {
  index: VectorIndex;
  embeddingProvider?: EmbeddingProvider;
  /** Owning-side memory lookup used for memory-field filters and results. */
  resolveMemory?: (id: string) => MemoryReference | undefined;
}

interface ScoringCandidate {
  id: string;
  score: number;
  metadata?: Record<string, string>;
  memory?: MemoryReference;
}

function issuesFor(message: string): RetrievalIssue[] {
  return [{ path: "retriever", message }];
}

function toCandidates(
  results: Array<{ id: string; score: number; metadata?: Record<string, string> }>
): ScoringCandidate[] {
  return results.map((entry) => ({
    id: entry.id,
    score: entry.score,
    metadata: entry.metadata ? { ...entry.metadata } : undefined,
  }));
}

export class MemoryRetriever {
  private readonly index: VectorIndex;
  private readonly embeddingProvider: EmbeddingProvider | undefined;
  private readonly resolveMemory: ((id: string) => MemoryReference | undefined) | undefined;

  constructor(options: MemoryRetrieverOptions) {
    if (!options || !options.index) {
      throw new RetrievalValidationError("invalid-query", issuesFor("options.index is required"));
    }
    this.index = options.index;
    this.embeddingProvider = options.embeddingProvider;
    this.resolveMemory = options.resolveMemory;
  }

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult[]> {
    assertRetrievalRequest(request);
    const queryVector = await this.resolveQueryVector(request);
    this.assertMemoryFieldFiltersSupported(request.filter);
    const topK = resolveTopK(request.topK);
    const minSimilarity = request.minSimilarity ?? 0;

    const candidates = toCandidates(
      this.index.search(queryVector, {
        topK,
        ids: request.filter?.ids,
      })
    );

    if (this.resolveMemory) {
      for (const candidate of candidates) {
        candidate.memory = copyMemory(this.resolveMemory(candidate.id));
      }
    }
    if (request.filter) {
      let filtered = candidates;
      if (request.filter.metadata !== undefined) {
        filtered = applyMetadataFilter(filtered, request.filter.metadata);
      }
      return rankRetrievalResults(
        applyMemoryFilters(filtered, request.filter, (id) =>
          copyMemory(this.resolveMemory ? this.resolveMemory(id) : undefined)
        ),
        { topK, minSimilarity }
      );
    }
    return rankRetrievalResults(candidates, { topK, minSimilarity });
  }

  retrieveByVector(
    vector: number[],
    options: { topK?: number; minSimilarity?: number; filter?: RetrievalFilter } = {}
  ): RetrievalResult[] {
    assertRetrievalRequest({ vector, ...options });
    const queryVector = this.validateIndexVector(vector);
    this.assertMemoryFieldFiltersSupported(options.filter);
    const topK = resolveTopK(options.topK);
    const minSimilarity = options.minSimilarity ?? 0;

    const candidates = toCandidates(
      this.index.search(queryVector, {
        topK,
        ids: options.filter?.ids,
      })
    );
    if (this.resolveMemory) {
      for (const candidate of candidates) {
        candidate.memory = copyMemory(this.resolveMemory(candidate.id));
      }
    }
    if (options.filter) {
      let filtered = candidates;
      if (options.filter.metadata !== undefined) {
        filtered = applyMetadataFilter(filtered, options.filter.metadata);
      }
      return rankRetrievalResults(
        applyMemoryFilters(filtered, options.filter, (id) =>
          copyMemory(this.resolveMemory ? this.resolveMemory(id) : undefined)
        ),
        { topK, minSimilarity }
      );
    }
    return rankRetrievalResults(candidates, { topK, minSimilarity });
  }

  private async resolveQueryVector(request: RetrievalRequest): Promise<number[]> {
    if (request.vector !== undefined) {
      return this.validateIndexVector(request.vector);
    }
    if (request.text !== undefined) {
      if (!this.embeddingProvider) {
        throw new RetrievalValidationError(
          "provider-required",
          issuesFor("query text requires a configured embedding provider")
        );
      }
      let response;
      try {
        response = await this.embeddingProvider.embed({ text: request.text });
      } catch (error) {
        if (error instanceof EmbeddingValidationError) {
          throw new RetrievalValidationError(
            "invalid-query",
            error.issues.map((entry) => ({ path: entry.path, message: entry.message }))
          );
        }
        throw error;
      }
      return this.validateIndexVector(response.vector);
    }
    throw new RetrievalValidationError(
      "invalid-query",
      issuesFor("request must provide a vector or query text")
    );
  }

  private validateIndexVector(vector: number[]): number[] {
    let validated: number[];
    try {
      validated = assertVectorValue(vector, "query vector");
    } catch (error) {
      if (error instanceof Error) {
        throw new RetrievalValidationError("invalid-vector", issuesFor(error.message));
      }
      throw error;
    }
    try {
      assertVectorDimensionMatches(validated, this.index.dimensions);
    } catch (error) {
      if (error instanceof Error) {
        throw new RetrievalValidationError("dimension-mismatch", issuesFor(error.message));
      }
      throw error;
    }
    return validated;
  }

  private assertMemoryFieldFiltersSupported(filter: RetrievalFilter | undefined): void {
    if (!filter) return;
    const needsResolver =
      filter.scopes !== undefined ||
      filter.sourceKinds !== undefined ||
      filter.projectIds !== undefined ||
      filter.tags !== undefined;
    if (needsResolver && !this.resolveMemory) {
      throw new RetrievalValidationError(
        "resolver-required",
        issuesFor("memory-field filters (scope/source/project/tags) require a memory resolver")
      );
    }
  }
}

export { copyMemory };
export type { RetrievalErrorCode };