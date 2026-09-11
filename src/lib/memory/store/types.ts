/**
 * M5.5 – MemoryStore domain types.
 * Provider-independent vocabulary for persistence operations.
 */

import type {
  MemoryConfidence,
  MemoryImportance,
  MemoryReference,
  MemoryScope,
  MemorySourceKind,
  MemoryStatus,
  MemoryType,
} from "../types";

export type MemoryStoreErrorCode =
  | "duplicate-id"
  | "not-found"
  | "invalid-record"
  | "invalid-id"
  | "capacity-exceeded"
  | "snapshot-error";

export interface MemoryStoreConfig {
  capacity?: number;
}

export interface MemoryListFilter {
  projectId?: string;
  memoryType?: MemoryType;
  status?: MemoryStatus;
  scope?: MemoryScope;
  sourceKind?: MemorySourceKind;
  tags?: string[];
  confidence?: MemoryConfidence;
  importance?: MemoryImportance;
}

export interface MemorySnapshotEntry {
  schema: string;
  memory: Record<string, unknown>;
}

export interface MemorySnapshot {
  version: string;
  entries: MemorySnapshotEntry[];
  createdAt: string;
}

export interface RestoreResult {
  restored: number;
  skipped: number;
  errors: string[];
}