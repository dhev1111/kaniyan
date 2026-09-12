/**
 * M5.7 – Memory health report generation.
 * Deterministic aggregate health analysis over a memory store.
 * No LLM, no network, no side effects.
 */

import { MEMORY_LIMITS } from "../limits";
import { isExpired, isActiveStatus, isArchivedStatus, daysSince } from "../lifecycle/status";
import { isEligibleForExpiration, DEFAULT_RETENTION_POLICY, type RetentionPolicy } from "../lifecycle/retention";
import { findExactDuplicates } from "../lifecycle/duplicates";
import { validateMemoryRecord } from "./validation";
import { makeDiagnostic, type Diagnostic, type HealthStatus } from "./diagnostics";
import { DIAGNOSTIC_CODES } from "./diagnostics";
import type { MemoryReference } from "../types";
import type { MemoryStore } from "../store/store";

export interface HealthReport {
  totalRecords: number;
  activeRecords: number;
  archivedRecords: number;
  expiredRecords: number;
  invalidRecords: number;
  duplicateCandidates: number;
  staleRecords: number;
  recordsNearRetentionLimit: number;
  healthStatus: HealthStatus;
  diagnostics: Diagnostic[];
  timestamp: string;
  bounded: boolean;
}

function countByStatus(memories: MemoryReference[]): {
  active: number;
  archived: number;
  expired: number;
  rejected: number;
  superseded: number;
  candidate: number;
} {
  let active = 0;
  let archived = 0;
  const expired = 0;
  let rejected = 0;
  let superseded = 0;
  let candidate = 0;

  for (const m of memories) {
    if (isActiveStatus(m.status)) active++;
    else if (isArchivedStatus(m.status)) archived++;
    else if (m.status === "rejected") rejected++;
    else if (m.status === "superseded") superseded++;
    else if (m.status === "candidate") candidate++;
  }

  return { active, archived, expired, rejected, superseded, candidate };
}

function countExpired(memories: MemoryReference[], asOf?: string): number {
  let count = 0;
  for (const m of memories) {
    if (isExpired(m, asOf)) count++;
  }
  return count;
}

function countStale(memories: MemoryReference[], asOf?: string): number {
  let count = 0;
  const threshold = MEMORY_LIMITS.STALENESS_THRESHOLD_DAYS;
  for (const m of memories) {
    if (isActiveStatus(m.status) && daysSince(m.createdAt, asOf) > threshold) {
      count++;
    }
  }
  return count;
}

function countDuplicateGroups(memories: MemoryReference[]): number {
  return findExactDuplicates(memories).length;
}

function countInvalidRecords(memories: MemoryReference[]): {
  count: number;
  diagnostics: Diagnostic[];
} {
  const allDiagnostics: Diagnostic[] = [];
  let invalidCount = 0;

  const limit = Math.min(memories.length, MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS);
  for (let i = 0; i < limit; i++) {
    const diagnostics = validateMemoryRecord(memories[i]);
    const hasErrors = diagnostics.some((d) => d.severity === "error");
    if (hasErrors) invalidCount++;
    allDiagnostics.push(...diagnostics);
  }

  if (memories.length > MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS) {
    allDiagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_RETENTION_WARNING,
      "info",
      `validation bounded to ${MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS} of ${memories.length} records`
    ));
  }

  return { count: invalidCount, diagnostics: allDiagnostics };
}

function countNearRetentionLimit(
  memories: MemoryReference[],
  policy: RetentionPolicy,
  asOf?: string
): number {
  let count = 0;
  const maxActive = policy.maxActiveMemories ?? MEMORY_LIMITS.DEFAULT_MAX_ACTIVE_MEMORIES;
  const active = memories.filter((m) => isActiveStatus(m.status)).length;

  if (active > maxActive * 0.9) {
    const eligible = memories.filter((m) => isEligibleForExpiration(m, policy, asOf));
    count = eligible.length;
  }

  return count;
}

function determineHealthStatus(
  invalidCount: number,
  totalRecords: number,
  duplicateGroups: number,
  staleRecords: number,
  expiredRecords: number
): HealthStatus {
  if (invalidCount > MEMORY_LIMITS.HEALTH_THRESHOLD_ERROR_COUNT) return "critical";
  if (totalRecords === 0) return "healthy";

  const errorRatio = invalidCount / totalRecords;
  if (errorRatio > MEMORY_LIMITS.HEALTH_THRESHOLD_WARNING_PERCENTAGE) return "critical";

  const duplicateRatio = totalRecords > 0 ? duplicateGroups / totalRecords : 0;
  if (duplicateRatio > MEMORY_LIMITS.HEALTH_THRESHOLD_DUPLICATE_PERCENTAGE) return "degraded";

  const staleRatio = totalRecords > 0 ? staleRecords / totalRecords : 0;
  if (staleRatio > MEMORY_LIMITS.HEALTH_THRESHOLD_STALE_PERCENTAGE) return "degraded";

  if (expiredRecords > 0) return "degraded";

  return "healthy";
}

export function generateHealthReport(
  store: MemoryStore,
  options: { policy?: RetentionPolicy; asOf?: string } = {}
): HealthReport {
  const policy = options.policy ?? DEFAULT_RETENTION_POLICY;
  const memories = store.list();
  const totalRecords = memories.length;
  const timestamp = new Date().toISOString();

  const statusCounts = countByStatus(memories);
  const expiredRecords = countExpired(memories, options.asOf);
  const staleRecords = countStale(memories, options.asOf);
  const duplicateGroups = countDuplicateGroups(memories);

  const { count: invalidRecords, diagnostics: validationDiagnostics } =
    countInvalidRecords(memories);

  const recordsNearRetentionLimit = countNearRetentionLimit(memories, policy, options.asOf);

  const activeNearLimit = statusCounts.active > (policy.maxActiveMemories ?? MEMORY_LIMITS.DEFAULT_MAX_ACTIVE_MEMORIES) * 0.9;
  if (activeNearLimit) {
    validationDiagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_ACTIVE_LIMIT,
      "warning",
      `active records (${statusCounts.active}) approaching retention limit`
    ));
  }

  if (staleRecords > 0) {
    validationDiagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_STALE,
      "warning",
      `${staleRecords} stale records detected`
    ));
  }

  if (duplicateGroups > 0) {
    validationDiagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_DUPLICATE,
      "warning",
      `${duplicateGroups} duplicate group(s) detected`
    ));
  }

  if (expiredRecords > 0) {
    validationDiagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_EXPIRED,
      "warning",
      `${expiredRecords} expired records detected`
    ));
  }

  const healthStatus = determineHealthStatus(
    invalidRecords,
    totalRecords,
    duplicateGroups,
    staleRecords,
    expiredRecords
  );

  const bounded = memories.length <= MEMORY_LIMITS.MAX_MAINTENANCE_RECORDS;

  return {
    totalRecords,
    activeRecords: statusCounts.active,
    archivedRecords: statusCounts.archived,
    expiredRecords,
    invalidRecords,
    duplicateCandidates: duplicateGroups,
    staleRecords,
    recordsNearRetentionLimit,
    healthStatus,
    diagnostics: validationDiagnostics,
    timestamp,
    bounded,
  };
}
