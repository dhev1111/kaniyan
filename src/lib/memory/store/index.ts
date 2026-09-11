/**
 * M5.5 – MemoryStore abstractions barrel.
 */

export type {
  MemoryStoreErrorCode,
  MemoryStoreConfig,
  MemoryListFilter,
  MemorySnapshot,
  MemorySnapshotEntry,
  RestoreResult,
} from "./types";

export type { MemoryStore } from "./store";

export {
  MemoryStoreError,
  assertStoreId,
  assertStoreRecord,
  clampStoreCapacity,
  matchesFilter,
  compareMemoryRecords,
  copyMemoryReference,
} from "./validation";

export { InMemoryMemoryStore } from "./in-memory";

export {
  createSnapshot,
  restoreSnapshot,
  validateSnapshotPayload,
  safeParseSnapshot,
} from "./snapshot";