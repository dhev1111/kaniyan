/**
 * M5.7 – Diagnostic codes and shared types for memory maintenance.
 * All codes are stable, deterministic and testable.
 */

export type DiagnosticSeverity = "info" | "warning" | "error";

export type MaintenanceAction =
  | "validate"
  | "review"
  | "consolidate"
  | "archive"
  | "cleanup"
  | "retain"
  | "ignore";

export type HealthStatus = "healthy" | "degraded" | "critical";

export const DIAGNOSTIC_CODES = {
  MEMORY_INVALID_RECORD: "MEMORY_INVALID_RECORD",
  MEMORY_MISSING_FIELD: "MEMORY_MISSING_FIELD",
  MEMORY_INVALID_ID: "MEMORY_INVALID_ID",
  MEMORY_INVALID_STATUS: "MEMORY_INVALID_STATUS",
  MEMORY_INVALID_TIMESTAMP: "MEMORY_INVALID_TIMESTAMP",
  MEMORY_IMPOSSIBLE_TIMESTAMPS: "MEMORY_IMPOSSIBLE_TIMESTAMPS",
  MEMORY_INVALID_CONFIDENCE: "MEMORY_INVALID_CONFIDENCE",
  MEMORY_INVALID_IMPORTANCE: "MEMORY_INVALID_IMPORTANCE",
  MEMORY_INVALID_TYPE: "MEMORY_INVALID_TYPE",
  MEMORY_CONTENT_LIMIT: "MEMORY_CONTENT_LIMIT",
  MEMORY_METADATA_LIMIT: "MEMORY_METADATA_LIMIT",
  MEMORY_PROVENANCE_INVALID: "MEMORY_PROVENANCE_INVALID",
  MEMORY_CONTENT_HASH_MISMATCH: "MEMORY_CONTENT_HASH_MISMATCH",
  MEMORY_EXPIRED: "MEMORY_EXPIRED",
  MEMORY_STALE: "MEMORY_STALE",
  MEMORY_DUPLICATE: "MEMORY_DUPLICATE",
  MEMORY_NEAR_DUPLICATE: "MEMORY_NEAR_DUPLICATE",
  MEMORY_RETENTION_WARNING: "MEMORY_RETENTION_WARNING",
  MEMORY_ACTIVE_LIMIT: "MEMORY_ACTIVE_LIMIT",
  MEMORY_INVALID_TRANSITION: "MEMORY_INVALID_TRANSITION",
} as const;

export type DiagnosticCode =
  (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES];

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  memoryId?: string;
}

export interface MaintenanceRecommendation {
  action: MaintenanceAction;
  severity: DiagnosticSeverity;
  code: string;
  reason: string;
  memoryIds: string[];
}

export interface MaintenanceExecution {
  action: MaintenanceAction;
  memoryIds: string[];
  success: boolean;
  reason: string;
}

export interface MaintenanceReport {
  scanned: number;
  validated: number;
  diagnostics: Diagnostic[];
  recommendations: MaintenanceRecommendation[];
  executions: MaintenanceExecution[];
  healthStatus: HealthStatus;
  timestamp: string;
  bounded: boolean;
}

export function makeDiagnostic(
  code: DiagnosticCode,
  severity: DiagnosticSeverity,
  message: string,
  memoryId?: string
): Diagnostic {
  const diagnostic: Diagnostic = { code, severity, message };
  if (memoryId !== undefined) diagnostic.memoryId = memoryId;
  return diagnostic;
}

export function makeRecommendation(
  action: MaintenanceAction,
  severity: DiagnosticSeverity,
  code: string,
  reason: string,
  memoryIds: string[] = []
): MaintenanceRecommendation {
  return { action, severity, code, reason, memoryIds };
}

export function makeExecution(
  action: MaintenanceAction,
  memoryIds: string[],
  success: boolean,
  reason: string
): MaintenanceExecution {
  return { action, memoryIds, success, reason };
}
