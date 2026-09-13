/**
 * M5.8 – Version lineage management.
 * Tracks parent→child version chains for memory records,
 * enforces depth limits, and detects cycles.
 */

import { MEMORY_LIMITS } from "../limits";
import { fnv1a36, nowIso } from "../util";
import type {
  MemoryConfidence,
  MemoryStatus,
} from "../types";
import type {
  VersionRecord,
  VersionChangeKind,
  VersionLineage,
  VersionError,
  VersioningErrorCode,
} from "./types";

const MAX_DEPTH = MEMORY_LIMITS.MAX_VERSION_LINEAGE_DEPTH;

export function createVersionRecord(
  memoryId: string,
  versionNumber: number,
  content: string,
  confidence: MemoryConfidence,
  status: MemoryStatus,
  changeKind: VersionChangeKind,
  parentVersion?: number,
  changeNote?: string,
): VersionRecord {
  const contentHash = fnv1a36(content);
  return {
    memoryId,
    versionNumber,
    contentHash,
    content,
    confidence,
    status,
    changeKind,
    changeNote,
    createdAt: nowIso(),
    parentVersion,
  };
}

export function createLineage(memoryId: string): VersionLineage {
  const now = nowIso();
  return {
    memoryId,
    currentVersion: 0,
    versions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addVersionToLineage(
  lineage: VersionLineage,
  record: VersionRecord,
): { ok: true; lineage: VersionLineage } | { ok: false; error: VersionError } {
  if (record.versionNumber < 1) {
    return {
      ok: false,
      error: makeVersionError("INVALID_VERSION_NUMBER", "Version number must be >= 1", lineage.memoryId, record.versionNumber),
    };
  }

  if (record.versionNumber !== lineage.currentVersion + 1) {
    return {
      ok: false,
      error: makeVersionError("INVALID_VERSION_NUMBER", `Expected version ${lineage.currentVersion + 1}, got ${record.versionNumber}`, lineage.memoryId, record.versionNumber),
    };
  }

  const depth = lineage.versions.length + 1;
  if (depth > MAX_DEPTH) {
    return {
      ok: false,
      error: makeVersionError("LINEAGE_DEPTH_EXCEEDED", `Lineage depth ${depth} exceeds max ${MAX_DEPTH}`, lineage.memoryId, record.versionNumber),
    };
  }

  if (record.parentVersion !== undefined) {
    const parentExists = lineage.versions.some(v => v.versionNumber === record.parentVersion);
    if (!parentExists) {
      return {
        ok: false,
        error: makeVersionError("PARENT_NOT_FOUND", `Parent version ${record.parentVersion} not found in lineage`, lineage.memoryId, record.versionNumber),
      };
    }
  }

  if (record.parentVersion === undefined && lineage.currentVersion > 0) {
    return {
      ok: false,
      error: makeVersionError("PARENT_NOT_FOUND", "All versions after v1 must specify a parent version", lineage.memoryId, record.versionNumber),
    };
  }

  return {
    ok: true,
    lineage: {
      ...lineage,
      currentVersion: record.versionNumber,
      versions: [...lineage.versions, record],
      updatedAt: nowIso(),
    },
  };
}

export function getVersion(lineage: VersionLineage, versionNumber: number): VersionRecord | undefined {
  return lineage.versions.find(v => v.versionNumber === versionNumber);
}

export function getLatestVersion(lineage: VersionLineage): VersionRecord | undefined {
  if (lineage.versions.length === 0) return undefined;
  return lineage.versions[lineage.versions.length - 1];
}

export function getVersionHistory(lineage: VersionLineage, limit?: number): VersionRecord[] {
  const reversed = [...lineage.versions].reverse();
  if (limit !== undefined && limit > 0) {
    return reversed.slice(0, limit);
  }
  return reversed;
}

export function detectCycles(lineage: VersionLineage): boolean {
  for (const record of lineage.versions) {
    if (record.parentVersion === undefined) continue;

    const visited = new Set<number>();
    let current: number | undefined = record.parentVersion;

    while (current !== undefined) {
      if (visited.has(current)) return true;
      visited.add(current);
      const parent = lineage.versions.find(v => v.versionNumber === current);
      current = parent?.parentVersion;
    }
  }
  return false;
}

export function validateLineageIntegrity(lineage: VersionLineage): {
  isValid: boolean;
  errors: VersionError[];
} {
  const errors: VersionError[] = [];

  if (lineage.versions.length === 0 && lineage.currentVersion === 0) {
    return { isValid: true, errors };
  }

  for (let i = 0; i < lineage.versions.length; i++) {
    const v = lineage.versions[i];
    const expectedNumber = i + 1;

    if (v.versionNumber !== expectedNumber) {
      errors.push(makeVersionError(
        "INVALID_VERSION_NUMBER",
        `Expected version ${expectedNumber} at index ${i}, got ${v.versionNumber}`,
        lineage.memoryId,
        v.versionNumber,
      ));
    }

    if (i > 0 && v.parentVersion === undefined) {
      errors.push(makeVersionError(
        "PARENT_NOT_FOUND",
        `Version ${v.versionNumber} has no parent version`,
        lineage.memoryId,
        v.versionNumber,
      ));
    }

    if (i > 0 && v.parentVersion !== undefined) {
      const parentExists = lineage.versions.slice(0, i).some(p => p.versionNumber === v.parentVersion);
      if (!parentExists) {
        errors.push(makeVersionError(
          "PARENT_NOT_FOUND",
          `Parent version ${v.parentVersion} of version ${v.versionNumber} not found in preceding versions`,
          lineage.memoryId,
          v.versionNumber,
        ));
      }
    }
  }

  if (lineage.currentVersion !== lineage.versions.length && lineage.versions.length > 0) {
    errors.push(makeVersionError(
      "INVALID_VERSION_NUMBER",
      `currentVersion ${lineage.currentVersion} does not match versions count ${lineage.versions.length}`,
      lineage.memoryId,
      lineage.currentVersion,
    ));
  }

  if (detectCycles(lineage)) {
    errors.push(makeVersionError(
      "CYCLE_DETECTED",
      "Cycle detected in version lineage",
      lineage.memoryId,
    ));
  }

  if (lineage.versions.length > MAX_DEPTH) {
    errors.push(makeVersionError(
      "LINEAGE_DEPTH_EXCEEDED",
      `Lineage depth ${lineage.versions.length} exceeds max ${MAX_DEPTH}`,
      lineage.memoryId,
    ));
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function makeVersionError(
  code: VersioningErrorCode,
  message: string,
  memoryId?: string,
  versionNumber?: number,
): VersionError {
  return { code, message, memoryId, versionNumber };
}
