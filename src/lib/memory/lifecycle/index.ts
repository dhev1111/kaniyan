/**
 * M5.6 – Lifecycle abstractions barrel.
 */

export {
  isValidTransition,
  isTerminalStatus,
  transitionStatus,
  activateMemory,
  archiveMemory,
  expireMemory,
  restoreMemory,
  isExpired,
  updateLastAccessed,
  daysSince,
  isActiveStatus,
  isArchivedStatus,
} from "./status";

export type { LifecycleTransition } from "./status";

export {
  DEFAULT_SCORING_WEIGHTS,
  importanceNumeric,
  recencyScore,
  accessFrequencyScore,
  computeMemoryScore,
  scoreMemories,
  validateWeights,
} from "./scoring";

export type { MemoryScoringWeights } from "./scoring";

export {
  contentHash,
  findExactDuplicates,
  findNearDuplicates,
  deduplicateByIdenticalContent,
} from "./duplicates";

export type { DuplicateGroup } from "./duplicates";

export {
  planConsolidation,
  consolidateGroup,
  consolidate,
} from "./consolidation";

export type {
  ConsolidationGroup,
  ConsolidationPlan,
  ConsolidationResult,
} from "./consolidation";

export {
  DEFAULT_RETENTION_POLICY,
  isProtected,
  isEligibleForExpiration,
  isEligibleForArchive,
  selectExpiredMemories,
  selectForRecycling,
} from "./retention";

export type { RetentionPolicy } from "./retention";

export { performCleanup } from "./cleanup";

export type {
  CleanupAction,
  CleanupReport,
  CleanupOptions,
} from "./cleanup";