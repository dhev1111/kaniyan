/**
 * M5.9 – Recall domain types.
 * Read-only, deterministic, bounded abstractions for querying,
 * filtering, ranking, deduplicating, and assembling memory context.
 */

import type {
  MemoryConfidence,
  MemoryImportance,
  MemoryReference,
  MemoryScope,
  MemorySourceKind,
  MemoryStatus,
  MemoryType,
} from "../types";
import type { MemoryScoringWeights } from "../lifecycle/scoring";

export type RecallErrorCode =
  | "invalid-query"
  | "empty-query"
  | "query-too-long"
  | "invalid-input"
  | "budget-exceeded";

export interface NormalizedQuery {
  text: string;
  originalLength: number;
  normalizedLength: number;
}

export interface RecallRequest {
  text: string;
  limit?: number;
  memoryTypes?: MemoryType[];
  scopes?: MemoryScope[];
  statuses?: MemoryStatus[];
  tags?: string[];
  confidence?: MemoryConfidence[];
  minImportance?: MemoryImportance;
  sourceKinds?: MemorySourceKind[];
  includeArchived?: boolean;
  contextBudget?: number;
  scoringWeights?: MemoryScoringWeights;
  asOf?: string;
  resolveLineage?: (memoryId: string) => { currentVersion: number; versions: Array<{ versionNumber: number; status: MemoryStatus }> } | undefined;
}

export interface RecallCandidate {
  memory: MemoryReference;
  versionNumber: number;
  isCurrentVersion: boolean;
  recallReasons: string[];
}

export interface RankedCandidate {
  memory: MemoryReference;
  versionNumber: number;
  isCurrentVersion: boolean;
  score: number;
  recallReasons: string[];
}

export interface DeduplicatedCandidate {
  memory: MemoryReference;
  versionNumber: number;
  isCurrentVersion: boolean;
  score: number;
  recallReasons: string[];
  deduplicated: boolean;
}

export interface ContextItem {
  memoryId: string;
  content: string;
  version: number;
  confidence: MemoryConfidence;
  importance: MemoryImportance;
  source: string;
  score: number;
  reasons: string[];
}

export interface AssembledContext {
  items: ContextItem[];
  totalCharacters: number;
  budgetUsed: number;
  budgetTotal: number;
  itemsIncluded: number;
  itemsDropped: number;
}

export interface RecallResult {
  query: NormalizedQuery;
  candidates: RecallCandidate[];
  ranked: RankedCandidate[];
  deduplicated: DeduplicatedCandidate[];
  context: AssembledContext;
  totalCandidatesFound: number;
  totalRecalled: number;
}
