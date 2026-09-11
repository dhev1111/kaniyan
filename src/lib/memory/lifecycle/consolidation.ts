/**
 * M5.6 – Memory consolidation: merging compatible records while
 * preserving full provenance. Atomic and deterministic.
 */

import { fnv1a36, memoryId, normalizeText, nowIso } from "../util";
import { constructMemory } from "../validation";
import type {
  MemoryConfidence,
  MemoryImportance,
  MemoryReference,
  MemoryRelationship,
  MemoryScope,
  MemorySource,
  MemoryStatus,
} from "../types";
import { findExactDuplicates } from "./duplicates";

export interface ConsolidationGroup {
  primaryId: string;
  mergedIds: string[];
  combinedContent: string;
}

export interface ConsolidationPlan {
  groups: ConsolidationGroup[];
  totalOriginals: number;
  totalAfterConsolidation: number;
}

export interface ConsolidationResult {
  consolidated: MemoryReference[];
  originalIds: string[];
  plan: ConsolidationPlan;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function mergeRelationships(
  a: MemoryRelationship[],
  b: MemoryRelationship[]
): MemoryRelationship[] {
  const seen = new Set<string>();
  const result: MemoryRelationship[] = [];
  for (const rel of [...a, ...b]) {
    const key = `${rel.targetId}|${rel.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ...rel });
    }
  }
  return result;
}

function highestImportance(a: MemoryImportance, b: MemoryImportance): MemoryImportance {
  const order: MemoryImportance[] = ["low", "medium", "high", "critical"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function highestConfidence(a: MemoryConfidence, b: MemoryConfidence): MemoryConfidence {
  const order: MemoryConfidence[] = ["low", "medium", "high"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function pickSource(a: MemorySource, b: MemorySource): MemorySource {
  if (a.url) return a;
  if (b.url) return b;
  return a;
}

function mergeSources(a: MemorySource, b: MemorySource): MemorySource {
  return pickSource(a, b);
}

export function planConsolidation(memories: MemoryReference[]): ConsolidationPlan {
  const groups = findExactDuplicates(memories);
  let totalOriginals = 0;
  let totalAfter = 0;
  const consolidatedIds = new Set<string>();
  const planGroups: ConsolidationGroup[] = [];

  for (const group of groups) {
    const allIds = [group.primaryId, ...group.duplicateIds];
    totalOriginals += allIds.length;
    totalAfter += 1;
    allIds.forEach((id) => consolidatedIds.add(id));

    const groupMemories = allIds
      .map((id) => memories.find((m) => m.id === id))
      .filter((m): m is MemoryReference => m !== undefined);
    const uniqueContents = [...new Set(groupMemories.map((m) => m.content))];
    const combined = uniqueContents.join("\n\n");
    planGroups.push({
      primaryId: group.primaryId,
      mergedIds: group.duplicateIds,
      combinedContent: combined,
    });
  }

  return {
    groups: planGroups,
    totalOriginals,
    totalAfterConsolidation: memories.length - totalOriginals + planGroups.length,
  };
}

export function consolidateGroup(
  memories: MemoryReference[],
  group: ConsolidationGroup,
  now?: string
): MemoryReference {
  const timestamp = nowIso(now);
  const allIds = [group.primaryId, ...group.mergedIds];
  const groupMemories = allIds
    .map((id) => memories.find((m) => m.id === id))
    .filter((m): m is MemoryReference => m !== undefined);

  if (groupMemories.length === 0) {
    throw new Error(`no memories found for consolidation group ${group.primaryId}`);
  }

  const primary = groupMemories[0];
  const combined = normalizeText(group.combinedContent);
  const contentHash = fnv1a36(combined);
  const mergedRelationships = groupMemories.reduce(
    (acc, m) => mergeRelationships(acc, m.relationships),
    [] as MemoryRelationship[]
  );
  const mergedTags = dedupeStrings(
    groupMemories.flatMap((m) => m.metadata.tags)
  );
  const mergedExtra: Record<string, string> = {};
  for (const m of groupMemories) {
    for (const [key, value] of Object.entries(m.metadata.extra)) {
      if (!(key in mergedExtra)) mergedExtra[key] = value;
    }
  }

  const sourceIds = groupMemories.map((m) => m.provenance.sourceId).filter(Boolean) as string[];
  const evidenceList = groupMemories
    .map((m) => m.provenance.evidence)
    .filter(Boolean)
    .join("\n");

  return constructMemory(
    {
      content: combined,
      type: primary.type,
      source: mergeSources(primary.source, groupMemories[1]?.source ?? primary.source),
      metadata: {
        scope: primary.metadata.scope,
        projectId: primary.metadata.projectId,
        taskId: primary.metadata.taskId,
        sessionId: primary.metadata.sessionId,
        tags: mergedTags,
        language: primary.metadata.language,
        author: primary.metadata.author,
        extra: mergedExtra,
      },
      provenance: {
        sourceKind: primary.provenance.sourceKind,
        sourceId: sourceIds.join(","),
        sourceUrl: primary.provenance.sourceUrl,
        origin: `consolidated from ${allIds.length} records`,
        evidence: evidenceList || undefined,
        ingestedAt: primary.provenance.ingestedAt,
      },
      importance: groupMemories.reduce(
        (best, m) => highestImportance(best, m.importance),
        "low" as MemoryImportance
      ),
      confidence: groupMemories.reduce(
        (best, m) => highestConfidence(best, m.confidence),
        "low" as MemoryConfidence
      ),
      status: "stored" as MemoryStatus,
      relationships: mergedRelationships,
    },
    { now: timestamp, id: group.primaryId, version: Math.max(...groupMemories.map((m) => m.version)) + 1 }
  );
}

export function consolidate(
  memories: MemoryReference[],
  now?: string
): ConsolidationResult {
  const plan = planConsolidation(memories);
  const consolidated: MemoryReference[] = [];
  const originalIds: string[] = [];

  for (const group of plan.groups) {
    const merged = consolidateGroup(memories, group, now);
    consolidated.push(merged);
    originalIds.push(group.primaryId, ...group.mergedIds);
  }

  return { consolidated, originalIds, plan };
}