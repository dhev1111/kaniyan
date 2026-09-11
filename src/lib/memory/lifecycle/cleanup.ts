/**
 * M5.6 – Cleanup: identify candidates, validate, protect, apply policy,
 * return deterministic report. Never silently deletes.
 */

import { nowIso } from "../util";
import type { MemoryReference, MemoryStatus } from "../types";
import type { MemoryStore } from "../store/store";
import type { RetentionPolicy } from "./retention";
import { DEFAULT_RETENTION_POLICY, isProtected, selectExpiredMemories, selectForRecycling } from "./retention";
import { expireMemory, isActiveStatus } from "./status";

export interface CleanupAction {
  id: string;
  action: "expired" | "recycled" | "archived" | "skipped";
  reason: string;
}

export interface CleanupReport {
  scanned: number;
  activeCount: number;
  archivedCount: number;
  expiredCount: number;
  duplicateCount: number;
  protectedCount: number;
  actions: CleanupAction[];
  timestamp: string;
}

export interface CleanupOptions {
  policy?: RetentionPolicy;
  dryRun?: boolean;
  asOf?: string;
}

export function performCleanup(
  store: MemoryStore,
  options: CleanupOptions = {}
): CleanupReport {
  const policy = options.policy ?? DEFAULT_RETENTION_POLICY;
  const timestamp = nowIso(options.asOf);
  const memories = store.list();
  const actions: CleanupAction[] = [];

  const activeCount = memories.filter((m) => isActiveStatus(m.status)).length;
  const archivedCount = memories.filter((m) => m.status === "archived").length;
  const protectedCount = memories.filter((m) => isProtected(m, policy)).length;

  const expiredCandidates = selectExpiredMemories(memories, policy, options.asOf);
  const recyclingIds = selectForRecycling(memories, policy, options.asOf);

  const idsToExpire = new Set<string>(expiredCandidates.map((m) => m.id));
  const idsToRecycle = new Set<string>(recyclingIds);

  const combinedIds = new Set<string>([...idsToExpire, ...idsToRecycle]);

  let expiredCount = 0;
  let recycledCount = 0;

  for (const id of combinedIds) {
    const memory = memories.find((m) => m.id === id);
    if (!memory) {
      actions.push({ id, action: "skipped", reason: "not found" });
      continue;
    }
    if (isProtected(memory, policy)) {
      actions.push({ id, action: "skipped", reason: "protected" });
      continue;
    }
    if (!isActiveStatus(memory.status)) {
      actions.push({ id, action: "skipped", reason: "not active" });
      continue;
    }

    if (idsToExpire.has(id)) {
      if (!options.dryRun) {
        store.upsert(expireMemory(memory, timestamp));
      }
      expiredCount += 1;
      actions.push({ id, action: "expired", reason: "retention policy" });
    } else if (idsToRecycle.has(id)) {
      if (!options.dryRun) {
        store.upsert(expireMemory(memory, timestamp));
      }
      recycledCount += 1;
      actions.push({ id, action: "recycled", reason: "active capacity exceeded" });
    }
  }

  return {
    scanned: memories.length,
    activeCount: activeCount - expiredCount - recycledCount,
    archivedCount,
    expiredCount,
    duplicateCount: 0,
    protectedCount,
    actions,
    timestamp,
  };
}