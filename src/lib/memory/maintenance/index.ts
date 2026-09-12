/**
 * M5.7 – Memory maintenance barrel.
 */

export {
  DIAGNOSTIC_CODES,
  makeDiagnostic,
  makeRecommendation,
  makeExecution,
} from "./diagnostics";

export type {
  DiagnosticCode,
  DiagnosticSeverity,
  Diagnostic,
  MaintenanceAction,
  MaintenanceRecommendation,
  MaintenanceExecution,
  HealthStatus,
  MaintenanceReport,
} from "./diagnostics";

export { validateMemoryRecord } from "./validation";

export { generateHealthReport } from "./health";

export type { HealthReport } from "./health";

export { generateRecommendations } from "./recommendations";

export { runMaintenance } from "./maintenance";

export type { MaintenanceOptions, MaintenanceResult } from "./maintenance";
