/**
 * M5.6 – Retention policy: bounded, deterministic expiration and limits.
 */

import { MEMORY_LIMITS } from "../limits";
import { daysSince, isExpired, isActiveStatus, isArchivedStatus } from "./status";
import type { MemoryImportance, MemoryReference, MemoryStatus } from "../types";

export interface RetentionPolicy {
  maxActiveMemories?: number;
  maxArchivedMemories?: number;
  maxAgeDays?: number;
  minImportance?: MemoryImportance;
  protectedIds?: string[];
  protectedTags?: string[];
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  maxActiveMemories: MEMORY_LIMITS.DEFAULT_MAX_ACTIVE_MEMORIES,
  maxArchivedMemories: MEMORY_LIMITS.DEFAULT_MAX_ARCHIVED_MEMORIES,
  maxAgeDays: MEMORY_LIMITS.DEFAULT_MAX_AGE_DAYS,
  minImportance: "low",
  protectedIds: [],
  protectedTags: [],
};

function isImportanceAtLeast(
  importance: MemoryImportance,
  minimum: MemoryImportance
): boolean {
  const order: MemoryImportance[] = ["low", "medium", "high", "critical"];
  return order.indexOf(importance) >= order.indexOf(minimum);
}

export function isProtected(memory: MemoryReference, policy: RetentionPolicy): boolean {
  const protectedIds = policy.protectedIds ?? [];
  const protectedTags = new Set(policy.protectedTags ?? []);
  if (protectedIds.includes(memory.id)) return true;
  if (memory.metadata.tags.some((tag) => protectedTags.has(tag))) return true;
  if (memory.importance === "critical") return true;
  return false;
}

export function isEligibleForExpiration(
  memory: MemoryReference,
  policy: RetentionPolicy,
  asOf?: string
): boolean {
  if (isProtected(memory, policy)) return false;
  if (!isActiveStatus(memory.status)) return false;
  if (policy.maxAgeDays !== undefined && daysSince(memory.createdAt, asOf) > policy.maxAgeDays) {
    return true;
  }
  if (
    policy.minImportance !== undefined &&
    !isImportanceAtLeast(memory.importance, policy.minImportance)
  ) {
    return true;
  }
  if (isExpired(memory, asOf)) return true;
  return false;
}

export function isEligibleForArchive(
  memory: MemoryReference,
  policy: RetentionPolicy,
  asOf?: string
): boolean {
  if (isProtected(memory, policy)) return false;
  if (!isActiveStatus(memory.status)) return false;
  if (isEligibleForExpiration(memory, policy, asOf)) return false;
  return false;
}

export function selectExpiredMemories(
  memories: MemoryReference[],
  policy: RetentionPolicy,
  asOf?: string
): MemoryReference[] {
  const eligible = memories
    .filter((m) => isEligibleForExpiration(m, policy, asOf))
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    );
  return eligible;
}

export function selectForRecycling(
  memories: MemoryReference[],
  policy: RetentionPolicy,
  asOf?: string
): string[] {
  const activeMemories = memories.filter((m) => isActiveStatus(m.status));
  const maxActive = policy.maxActiveMemories ?? MEMORY_LIMITS.DEFAULT_MAX_ACTIVE_MEMORIES;
  if (activeMemories.length <= maxActive) return [];

  const scored = activeMemories
    .map((m) => ({
      id: m.id,
      eligible: isEligibleForExpiration(m, policy, asOf),
      createdAt: m.createdAt,
      idSort: m.id,
    }))
    .filter((entry) => entry.eligible)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.idSort.localeCompare(b.idSort)
    );

  const excess = activeMemories.length - maxActive;
  return scored.slice(0, Math.min(excess, MEMORY_LIMITS.MAX_RECYCLING_LIMIT)).map((entry) => entry.id);
}