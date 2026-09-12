/**
 * M5.7 – Maintenance recommendation layer.
 * Converts diagnostics into safe, bounded recommended actions.
 * Recommendations are NOT automatically executed.
 */

import { MEMORY_LIMITS } from "../limits";
import { isActiveStatus } from "../lifecycle/status";
import { isEligibleForExpiration, DEFAULT_RETENTION_POLICY, type RetentionPolicy } from "../lifecycle/retention";
import { makeRecommendation, type Diagnostic, type MaintenanceRecommendation } from "./diagnostics";
import { DIAGNOSTIC_CODES } from "./diagnostics";
import type { MemoryReference } from "../types";

function diagnosticsByMemoryId(diagnostics: Diagnostic[]): Map<string, Diagnostic[]> {
  const map = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    if (d.memoryId === undefined) continue;
    const existing = map.get(d.memoryId) ?? [];
    existing.push(d);
    map.set(d.memoryId, existing);
  }
  return map;
}

export function generateRecommendations(
  diagnostics: Diagnostic[],
  memories: MemoryReference[],
  options: { policy?: RetentionPolicy; asOf?: string } = {}
): MaintenanceRecommendation[] {
  const policy = options.policy ?? DEFAULT_RETENTION_POLICY;
  const recommendations: MaintenanceRecommendation[] = [];
  const byId = diagnosticsByMemoryId(diagnostics);

  const processedIds = new Set<string>();

  for (const [memoryId, memDiagnostics] of byId) {
    if (processedIds.has(memoryId)) continue;
    processedIds.add(memoryId);

    const hasError = memDiagnostics.some((d) => d.severity === "error");
    const hasWarning = memDiagnostics.some((d) => d.severity === "warning");

    if (hasError) {
      const errorCodes = memDiagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.code);

      if (
        errorCodes.includes(DIAGNOSTIC_CODES.MEMORY_INVALID_RECORD) ||
        errorCodes.includes(DIAGNOSTIC_CODES.MEMORY_MISSING_FIELD) ||
        errorCodes.includes(DIAGNOSTIC_CODES.MEMORY_INVALID_ID)
      ) {
        recommendations.push(makeRecommendation(
          "review",
          "error",
          errorCodes[0],
          `memory ${memoryId} has structural errors requiring review`,
          [memoryId]
        ));
      } else if (
        errorCodes.includes(DIAGNOSTIC_CODES.MEMORY_INVALID_STATUS) ||
        errorCodes.includes(DIAGNOSTIC_CODES.MEMORY_INVALID_TIMESTAMP) ||
        errorCodes.includes(DIAGNOSTIC_CODES.MEMORY_IMPOSSIBLE_TIMESTAMPS)
      ) {
        recommendations.push(makeRecommendation(
          "review",
          "error",
          errorCodes[0],
          `memory ${memoryId} has lifecycle/timestamp errors`,
          [memoryId]
        ));
      } else {
        recommendations.push(makeRecommendation(
          "validate",
          "error",
          errorCodes[0],
          `memory ${memoryId} failed validation`,
          [memoryId]
        ));
      }
    } else if (hasWarning) {
      const warningCodes = memDiagnostics
        .filter((d) => d.severity === "warning")
        .map((d) => d.code);

      if (warningCodes.includes(DIAGNOSTIC_CODES.MEMORY_CONTENT_HASH_MISMATCH)) {
        recommendations.push(makeRecommendation(
          "review",
          "warning",
          DIAGNOSTIC_CODES.MEMORY_CONTENT_HASH_MISMATCH,
          `memory ${memoryId} content hash mismatch`,
          [memoryId]
        ));
      }
    }
  }

  const memory = memories.find((m) => m.id !== undefined);
  if (memory !== undefined) {
    const expired = memories.filter((m) => isEligibleForExpiration(m, policy, options.asOf));
    if (expired.length > 0) {
      recommendations.push(makeRecommendation(
        "cleanup",
        "warning",
        DIAGNOSTIC_CODES.MEMORY_EXPIRED,
        `${expired.length} records eligible for cleanup`,
        expired.map((m) => m.id)
      ));
    }
  }

  const memoryById = new Map(memories.map((m) => [m.id, m]));
  const duplicateMentioned = diagnostics.filter(
    (d) => d.code === DIAGNOSTIC_CODES.MEMORY_DUPLICATE
  );
  if (duplicateMentioned.length > 0) {
    const affectedIds = [...memoryById.keys()].filter((id) => {
      const m = memoryById.get(id);
      return m !== undefined && isActiveStatus(m.status);
    });
    if (affectedIds.length > 0) {
      recommendations.push(makeRecommendation(
        "consolidate",
        "warning",
        DIAGNOSTIC_CODES.MEMORY_DUPLICATE,
        "duplicate records detected; consolidation recommended",
        affectedIds.slice(0, MEMORY_LIMITS.MAX_CONSOLIDATION_OPERATIONS)
      ));
    }
  }

  const staleMentioned = diagnostics.filter(
    (d) => d.code === DIAGNOSTIC_CODES.MEMORY_STALE
  );
  if (staleMentioned.length > 0) {
    const staleIds = memories
      .filter((m) => isActiveStatus(m.status))
      .map((m) => m.id)
      .slice(0, MEMORY_LIMITS.MAX_RECOMMENDATIONS);
    recommendations.push(makeRecommendation(
      "retain",
      "info",
      DIAGNOSTIC_CODES.MEMORY_STALE,
      "stale records detected; review for archival",
      staleIds
    ));
  }

  if (recommendations.length > MEMORY_LIMITS.MAX_RECOMMENDATIONS) {
    return recommendations.slice(0, MEMORY_LIMITS.MAX_RECOMMENDATIONS);
  }

  return recommendations;
}
