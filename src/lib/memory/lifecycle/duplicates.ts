/**
 * M5.6 – Duplicate detection for memory records.
 * Uses content hashing for exact matches and optional embedding
 * similarity for near-duplicates. Never automatically merges.
 */

import { fnv1a36, normalizeText } from "../util";
import { cosineSimilarity } from "../vector/similarity";
import type { MemoryReference } from "../types";

export interface DuplicateGroup {
  primaryId: string;
  duplicateIds: string[];
  kind: "exact" | "near";
}

export function contentHash(text: string): string {
  return fnv1a36(normalizeText(text));
}

export function findExactDuplicates(memories: MemoryReference[]): DuplicateGroup[] {
  const hashGroups = new Map<string, string[]>();
  for (const memory of memories) {
    const hash = contentHash(memory.content);
    const existing = hashGroups.get(hash) ?? [];
    existing.push(memory.id);
    hashGroups.set(hash, existing);
  }
  const groups: DuplicateGroup[] = [];
  for (const [, ids] of hashGroups) {
    if (ids.length > 1) {
      const sorted = [...ids].sort();
      groups.push({ primaryId: sorted[0], duplicateIds: sorted.slice(1), kind: "exact" });
    }
  }
  return groups.sort((a, b) => a.primaryId.localeCompare(b.primaryId));
}

export function findNearDuplicates(
  memories: MemoryReference[],
  vectors: Map<string, number[]>,
  threshold = 0.95
): DuplicateGroup[] {
  const entries = memories
    .filter((memory) => vectors.has(memory.id))
    .map((memory) => ({ id: memory.id, vector: vectors.get(memory.id)! }));

  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>();

  for (let i = 0; i < entries.length; i += 1) {
    const a = entries[i];
    if (claimed.has(a.id)) continue;
    const duplicates: string[] = [];
    for (let j = i + 1; j < entries.length; j += 1) {
      const b = entries[j];
      if (claimed.has(b.id)) continue;
      const score = cosineSimilarity(a.vector, b.vector);
      if (score >= threshold) {
        duplicates.push(b.id);
        claimed.add(b.id);
      }
    }
    if (duplicates.length > 0) {
      claimed.add(a.id);
      const sorted = [...duplicates].sort();
      groups.push({ primaryId: a.id, duplicateIds: sorted, kind: "near" });
    }
  }
  return groups.sort((a, b) => a.primaryId.localeCompare(b.primaryId));
}

export function deduplicateByIdenticalContent(
  memories: MemoryReference[]
): { kept: MemoryReference[]; removed: string[] } {
  const seen = new Map<string, MemoryReference>();
  const removed: string[] = [];
  const sorted = [...memories].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
  for (const memory of sorted) {
    const hash = contentHash(memory.content);
    if (seen.has(hash)) {
      removed.push(memory.id);
    } else {
      seen.set(hash, memory);
    }
  }
  return { kept: [...seen.values()], removed };
}