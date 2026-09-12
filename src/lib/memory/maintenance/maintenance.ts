/**
 * M5.7 – Safe maintenance execution engine.
 * Performs bounded, deterministic, idempotent maintenance operations
 * using only existing M5.6 lifecycle APIs. Never bypasses lifecycle rules.
 */

import { MEMORY_LIMITS } from "../limits";
import { nowIso } from "../util";
import { isActiveStatus } from "../lifecycle/status";
import { isEligibleForExpiration, DEFAULT_RETENTION_POLICY, type RetentionPolicy } from "../lifecycle/retention";
import { findExactDuplicates } from "../lifecycle/duplicates";
import { consolidate } from "../lifecycle/consolidation";
import { performCleanup } from "../lifecycle/cleanup";
import { validateMemoryRecord } from "./validation";
import { generateHealthReport, type HealthReport } from "./health";
import { generateRecommendations } from "./recommendations";
import { makeExecution, type MaintenanceRecommendation, type MaintenanceExecution, type Diagnostic, type HealthStatus } from "./diagnostics";
import type { MemoryReference } from "../types";
import type { MemoryStore } from "../store/store";

export interface MaintenanceOptions {
  policy?: RetentionPolicy;
  dryRun?: boolean;
  asOf?: string;
  maxOperations?: number;
}

export interface MaintenanceResult {
  healthReport: HealthReport;
  diagnostics: Diagnostic[];
  recommendations: MaintenanceRecommendation[];
  executions: MaintenanceExecution[];
  healthStatus: HealthStatus;
  scanned: number;
  validated: number;
  actionsExecuted: number;
  bounded: boolean;
  timestamp: string;
}

function validateAllRecords(
  memories: MemoryReference[],
  maxOps: number
): { diagnostics: Diagnostic[]; invalidCount: number } {
  const allDiagnostics: Diagnostic[] = [];
  let invalidCount = 0;
  const limit = Math.min(memories.length, maxOps, MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS);

  for (let i = 0; i < limit; i++) {
    const diagnostics = validateMemoryRecord(memories[i]);
    const hasErrors = diagnostics.some((d) => d.severity === "error");
    if (hasErrors) invalidCount++;
    allDiagnostics.push(...diagnostics);
  }

  return { diagnostics: allDiagnostics, invalidCount };
}

function executeArchiveExpired(
  store: MemoryStore,
  policy: RetentionPolicy,
  asOf?: string,
  dryRun = false
): MaintenanceExecution {
  const memories = store.list();
  const expired = memories.filter((m) => isEligibleForExpiration(m, policy, asOf));
  const ids = expired.map((m) => m.id).slice(0, MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS);

  if (ids.length === 0) {
    return makeExecution("archive", [], true, "no expired records to archive");
  }

  if (dryRun) {
    return makeExecution("archive", ids, true, `would archive ${ids.length} expired records`);
  }

  let archived = 0;
  const timestamp = nowIso(asOf);
  for (const id of ids) {
    const memory = store.get(id);
    if (!memory || !isActiveStatus(memory.status)) continue;
    try {
      store.upsert({ ...memory, status: "superseded", updatedAt: timestamp });
      archived++;
    } catch {
      return makeExecution("archive", ids.slice(0, archived), false, `failed archiving at record ${archived}`);
    }
  }

  return makeExecution("archive", ids.slice(0, archived), true, `archived ${archived} expired records`);
}

function executeConsolidate(
  store: MemoryStore,
  asOf?: string,
  dryRun = false,
  maxOps: number = MEMORY_LIMITS.MAX_CONSOLIDATION_OPERATIONS
): MaintenanceExecution {
  const memories = store.list();
  const exactGroups = findExactDuplicates(memories);
  const limitedGroups = exactGroups.slice(0, maxOps);

  if (limitedGroups.length === 0) {
    return makeExecution("consolidate", [], true, "no duplicates to consolidate");
  }

  const allIds = limitedGroups.flatMap((g) => [g.primaryId, ...g.duplicateIds]);
  const uniqueIds = [...new Set(allIds)].slice(0, MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS);

  if (dryRun) {
    return makeExecution("consolidate", uniqueIds, true, `would consolidate ${limitedGroups.length} groups`);
  }

  try {
    const result = consolidate(memories, asOf);
    const consolidatedIds = result.originalIds.slice(0, MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS);

    for (const merged of result.consolidated) {
      store.upsert(merged);
    }
    for (const id of consolidatedIds) {
      const existing = store.get(id);
      if (existing && result.consolidated.some((c) => c.id !== id)) {
        store.delete(id);
      }
    }

    return makeExecution("consolidate", consolidatedIds, true, `consolidated ${result.consolidated.length} groups`);
  } catch {
    return makeExecution("consolidate", uniqueIds, false, "consolidation failed");
  }
}

function executeCleanup(
  store: MemoryStore,
  policy: RetentionPolicy,
  asOf?: string,
  dryRun = false
): MaintenanceExecution {
  if (dryRun) {
    const report = performCleanup(store, { policy, dryRun: true, asOf });
    return makeExecution(
      "cleanup",
      report.actions.map((a) => a.id),
      true,
      `would clean ${report.actions.length} records`
    );
  }

  const report = performCleanup(store, { policy, dryRun: false, asOf });
  return makeExecution(
    "cleanup",
    report.actions.map((a) => a.id),
    true,
    `cleaned ${report.actions.length} records`
  );
}

export function runMaintenance(
  store: MemoryStore,
  options: MaintenanceOptions = {}
): MaintenanceResult {
  const policy = options.policy ?? DEFAULT_RETENTION_POLICY;
  const dryRun = options.dryRun ?? false;
  const maxOps = options.maxOperations ?? MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS;
  const timestamp = nowIso(options.asOf);

  const memories = store.list();
  const scanned = memories.length;
  const bounded = scanned <= MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS;

  const { diagnostics, invalidCount } = validateAllRecords(memories, maxOps);

  const healthReport = generateHealthReport(store, { policy, asOf: options.asOf });

  const recommendations = generateRecommendations(diagnostics, memories, { policy, asOf: options.asOf });

  const executions: MaintenanceExecution[] = [];
  let actionsExecuted = 0;

  const archiveResult = executeArchiveExpired(store, policy, options.asOf, dryRun);
  executions.push(archiveResult);
  if (archiveResult.memoryIds.length > 0) actionsExecuted++;

  const consolidateResult = executeConsolidate(store, options.asOf, dryRun, maxOps);
  executions.push(consolidateResult);
  if (consolidateResult.memoryIds.length > 0) actionsExecuted++;

  const cleanupResult = executeCleanup(store, policy, options.asOf, dryRun);
  executions.push(cleanupResult);
  if (cleanupResult.memoryIds.length > 0) actionsExecuted++;

  return {
    healthReport,
    diagnostics,
    recommendations,
    executions,
    healthStatus: healthReport.healthStatus,
    scanned,
    validated: scanned - invalidCount,
    actionsExecuted,
    bounded,
    timestamp,
  };
}
