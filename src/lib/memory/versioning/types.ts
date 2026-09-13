/**
 * M5.8 – Memory versioning & evolution types.
 * Deterministic, provider-agnostic abstractions for tracking how
 * memory records change over time, detecting conflicts, and verifying
 * integrity of version chains.
 */

import type {
  MemoryConfidence,
  MemoryStatus,
  ConflictState,
} from "../types";

export type VersionChangeKind = "content" | "confidence" | "status" | "metadata";

export type ConflictDetectionStrategy = "content-hash" | "semantic" | "manual";

export type ResolutionAction = "keep-latest" | "keep-oldest" | "merge" | "manual";

export type VersioningErrorCode =
  | "INVALID_VERSION_NUMBER"
  | "VERSION_NOT_FOUND"
  | "LINEAGE_DEPTH_EXCEEDED"
  | "CYCLE_DETECTED"
  | "INTEGRITY_VIOLATION"
  | "TAMPERING_DETECTED"
  | "ALREADY_RESOLVED"
  | "PARENT_NOT_FOUND";

export interface VersionRecord {
  memoryId: string;
  versionNumber: number;
  contentHash: string;
  content: string;
  confidence: MemoryConfidence;
  status: MemoryStatus;
  changeKind: VersionChangeKind;
  changeNote?: string;
  createdAt: string;
  parentVersion?: number;
}

export interface VersionDiff {
  memoryId: string;
  fromVersion: number;
  toVersion: number;
  contentChanged: boolean;
  confidenceChanged: boolean;
  statusChanged: boolean;
  contentHashBefore: string;
  contentHashAfter: string;
  confidenceBefore: MemoryConfidence;
  confidenceAfter: MemoryConfidence;
  statusBefore: MemoryStatus;
  statusAfter: MemoryStatus;
}

export interface VersionLineage {
  memoryId: string;
  currentVersion: number;
  versions: VersionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ConflictDetection {
  conflictId: string;
  memoryId: string;
  strategy: ConflictDetectionStrategy;
  versionA: number;
  versionB: number;
  detectedAt: string;
  state: ConflictState;
  resolutionNote?: string;
}

export interface VersionResolution {
  conflictId: string;
  resolution: ResolutionAction;
  winningVersion?: number;
  mergedContent?: string;
  resolvedAt: string;
  note?: string;
}

export interface IntegrityResult {
  memoryId: string;
  isValid: boolean;
  expectedHash: string;
  actualHash: string;
  tamperedVersions: number[];
  checkedAt: string;
}

export interface VersionError {
  code: VersioningErrorCode;
  message: string;
  memoryId?: string;
  versionNumber?: number;
}
