/**
 * M5.4 – Deterministic retrieval ranking.
 * Ranking reuses the M5.3 cosine similarity ordering: score descending,
 * then stable ID ascending. Filters are declarative and monotone (they only
 * remove candidates), so post-rank application never invalidates the topK.
 */

import { clamp } from "../util";
import { compareVectorResults } from "../vector/similarity";
import { RetrievalValidationError, type RetrievalIssue } from "./validation";
import type { RetrievalFilter, RetrievalResult } from "./types";

interface ScoredCandidate {
  id: string;
  score: number;
  metadata?: Record<string, string>;
  memory?: RetrievalResult["memory"];
}

function cloneCandidate(candidate: ScoredCandidate): ScoredCandidate {
  return {
    id: candidate.id,
    score: candidate.score,
    metadata: candidate.metadata ? { ...candidate.metadata } : undefined,
    memory: copyMemory(candidate.memory),
  };
}

export function copyMemory(
  memory: RetrievalResult["memory"]
): RetrievalResult["memory"] {
  if (!memory) return undefined;
  return {
    id: memory.id,
    content: memory.content,
    type: memory.type,
    source: { ...memory.source },
    metadata: {
      scope: memory.metadata.scope,
      projectId: memory.metadata.projectId,
      taskId: memory.metadata.taskId,
      sessionId: memory.metadata.sessionId,
      tags: memory.metadata.tags.slice(),
      language: memory.metadata.language,
      author: memory.metadata.author,
      extra: { ...memory.metadata.extra },
    },
    provenance: { ...memory.provenance },
    importance: memory.importance,
    confidence: memory.confidence,
    status: memory.status,
    contentHash: memory.contentHash,
    version: memory.version,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    lastAccessedAt: memory.lastAccessedAt,
    relationships: memory.relationships.map((entry) => ({ ...entry })),
    conflicts: memory.conflicts.map((entry) => ({
      conflictId: entry.conflictId,
      involvedMemoryIds: entry.involvedMemoryIds.slice(),
      state: entry.state,
      detectedAt: entry.detectedAt,
      resolutionNote: entry.resolutionNote,
    })),
  };
}

export function applyMinimumSimilarity(
  candidates: ScoredCandidate[],
  minSimilarity: number
): ScoredCandidate[] {
  return candidates.filter((candidate) => candidate.score >= minSimilarity);
}

export function applyMetadataFilter(
  candidates: ScoredCandidate[],
  metadata: Record<string, string>
): ScoredCandidate[] {
  return candidates.filter((candidate) => {
    if (!candidate.metadata) return false;
    for (const key of Object.keys(metadata)) {
      if (candidate.metadata[key] !== metadata[key]) return false;
    }
    return true;
  });
}

/**
 * Applies memory-field filters (scope/source kind/project/tags) through a
 * resolver. The resolver is a fixed, owning-side lookup, never user data.
 */
export function applyMemoryFilters(
  candidates: ScoredCandidate[],
  filter: RetrievalFilter,
  resolveMemory: (id: string) => RetrievalResult["memory"]
): ScoredCandidate[] {
  const needsResolver =
    filter.scopes !== undefined ||
    filter.sourceKinds !== undefined ||
    filter.projectIds !== undefined ||
    filter.tags !== undefined;
  if (!needsResolver) return candidates;

  const projectSet = filter.projectIds ? new Set<string>(filter.projectIds) : undefined;
  const tagSet = filter.tags ? new Set<string>(filter.tags) : undefined;
  const scopeSet = filter.scopes ? new Set<string>(filter.scopes) : undefined;
  const kindSet = filter.sourceKinds ? new Set<string>(filter.sourceKinds) : undefined;

  return candidates.filter((candidate) => {
    const memory = resolveMemory(candidate.id);
    if (!memory) return false;
    if (scopeSet !== undefined && !scopeSet.has(memory.metadata.scope)) return false;
    if (kindSet !== undefined && !kindSet.has(memory.provenance.sourceKind)) return false;
    if (projectSet !== undefined && !(memory.metadata.projectId !== undefined && projectSet.has(memory.metadata.projectId))) {
      return false;
    }
    if (tagSet !== undefined) {
      const hasAnyTag = memory.metadata.tags.some((tag) => tagSet.has(tag));
      if (!hasAnyTag) return false;
    }
    return true;
  });
}

function toIssues(message: string): RetrievalIssue[] {
  return [{ path: "ranking", message }];
}

/**
 * Stable-end-to-end ranking: filter, order (score desc, id asc), enforce
 * topK and assign 1-based ranks. Returns defensively copied results.
 */
export function rankRetrievalResults(
  candidates: ScoredCandidate[],
  options: { topK: number; minSimilarity: number }
): RetrievalResult[] {
  let working = candidates.map(cloneCandidate);
  working = applyMinimumSimilarity(working, options.minSimilarity);
  const sorted = [...working].sort(compareVectorResults);
  const bound = clamp(options.topK, 1, sorted.length);
  const results: RetrievalResult[] = [];
  for (let index = 0; index < bound; index += 1) {
    const candidate = sorted[index];
    if (!candidate) break;
    if (!Number.isFinite(candidate.score)) {
      throw new RetrievalValidationError("invalid-vector", toIssues("non-finite score surfaced from index"));
    }
    results.push({
      id: candidate.id,
      score: candidate.score,
      rank: index + 1,
      metadata: candidate.metadata ? { ...candidate.metadata } : undefined,
      memory: candidate.memory ? { ...candidate.memory, metadata: { ...candidate.memory.metadata, tags: candidate.memory.metadata.tags.slice(), extra: { ...candidate.memory.metadata.extra } }, relationships: candidate.memory.relationships.map((entry) => ({ ...entry })), conflicts: candidate.memory.conflicts.map((entry) => ({ ...entry })) } : undefined,
    });
  }
  return results;
}