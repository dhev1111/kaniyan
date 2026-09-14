/**
 * M5.9 – Candidate retrieval and lifecycle-aware filtering.
 * Selects memories from the store, applies lifecycle eligibility rules,
 * resolves version preference, and preserves provenance.
 * Pure read-only — never mutates store or memory state.
 */

import { MEMORY_LIMITS } from "../limits";
import type { MemoryReference, MemoryStatus } from "../types";
import type { MemoryStore } from "../store/store";
import { isActiveStatus, isExpired } from "../lifecycle/status";
import type { RecallCandidate, RecallRequest } from "./types";

const MAX_CANDIDATES = MEMORY_LIMITS.MAX_RECALL_CANDIDATES;

function isLifecycleEligible(memory: MemoryReference, includeArchived: boolean): boolean {
  if (isExpired(memory)) return false;
  if (isActiveStatus(memory.status)) return true;
  if (includeArchived && memory.status === "archived") return true;
  return false;
}

function matchesTextFilter(memory: MemoryReference, text: string): boolean {
  const lower = text.toLowerCase();
  return (
    memory.content.toLowerCase().includes(lower) ||
    memory.metadata.tags.some(tag => tag.toLowerCase().includes(lower)) ||
    (memory.metadata.extra &&
      Object.values(memory.metadata.extra).some(v => v.toLowerCase().includes(lower)))
  );
}

function resolveVersionPreference(
  memory: MemoryReference,
  resolveLineage?: RecallRequest["resolveLineage"]
): { versionNumber: number; isCurrentVersion: boolean } {
  if (!resolveLineage) {
    return { versionNumber: memory.version, isCurrentVersion: true };
  }

  const lineage = resolveLineage(memory.id);
  if (!lineage || lineage.versions.length === 0) {
    return { versionNumber: memory.version, isCurrentVersion: true };
  }

  const latestValid = lineage.versions
    .filter(v => v.status === memory.status || isActiveStatus(v.status))
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];

  if (!latestValid) {
    return { versionNumber: memory.version, isCurrentVersion: true };
  }

  return {
    versionNumber: latestValid.versionNumber,
    isCurrentVersion: latestValid.versionNumber === lineage.currentVersion,
  };
}

export function selectCandidates(
  store: MemoryStore,
  request: RecallRequest
): RecallCandidate[] {
  const includeArchived = request.includeArchived ?? false;
  const text = request.text;

  const allMemories = store.list();
  const candidates: RecallCandidate[] = [];

  for (const memory of allMemories) {
    if (candidates.length >= MAX_CANDIDATES) break;

    if (!isLifecycleEligible(memory, includeArchived)) continue;

    if (request.memoryTypes && request.memoryTypes.length > 0) {
      if (!request.memoryTypes.includes(memory.type)) continue;
    }

    if (request.scopes && request.scopes.length > 0) {
      if (!request.scopes.includes(memory.metadata.scope)) continue;
    }

    if (request.statuses && request.statuses.length > 0) {
      if (!request.statuses.includes(memory.status)) continue;
    }

    if (request.tags && request.tags.length > 0) {
      const hasAnyTag = request.tags.some(tag => memory.metadata.tags.includes(tag));
      if (!hasAnyTag) continue;
    }

    if (request.confidence && request.confidence.length > 0) {
      if (!request.confidence.includes(memory.confidence)) continue;
    }

    if (request.minImportance) {
      const importanceOrder = ["low", "medium", "high", "critical"];
      const memIdx = importanceOrder.indexOf(memory.importance);
      const minIdx = importanceOrder.indexOf(request.minImportance);
      if (memIdx < minIdx) continue;
    }

    if (request.sourceKinds && request.sourceKinds.length > 0) {
      if (!request.sourceKinds.includes(memory.provenance.sourceKind)) continue;
    }

    if (text && text.trim().length > 0) {
      if (!matchesTextFilter(memory, text)) continue;
    }

    const { versionNumber, isCurrentVersion } = resolveVersionPreference(
      memory,
      request.resolveLineage
    );

    const recallReasons: string[] = [];
    if (text && matchesTextFilter(memory, text)) recallReasons.push("query-match");
    if (memory.importance === "critical" || memory.importance === "high") recallReasons.push("importance");
    if (memory.confidence === "high") recallReasons.push("confidence");
    if (isCurrentVersion) recallReasons.push("version-current");

    candidates.push({
      memory,
      versionNumber,
      isCurrentVersion,
      recallReasons,
    });
  }

  return candidates;
}
