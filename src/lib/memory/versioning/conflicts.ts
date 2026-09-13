/**
 * M5.8 – Version conflict detection and resolution.
 * Detects supersession conflicts (concurrent edits) and
 * resolves them with deterministic strategies.
 */

import { fnv1a36, nowIso } from "../util";
import { getVersion, getLatestVersion } from "./lineage";
import type { VersionLineage, ConflictDetection, VersionResolution, ResolutionAction } from "./types";

export function detectContentConflict(
  lineage: VersionLineage,
  versionA: number,
  versionB: number,
): ConflictDetection | undefined {
  const a = getVersion(lineage, versionA);
  const b = getVersion(lineage, versionB);

  if (!a || !b) return undefined;

  if (a.contentHash === b.contentHash) return undefined;

  return {
    conflictId: `conflict-${lineage.memoryId}-${versionA}-${versionB}`,
    memoryId: lineage.memoryId,
    strategy: "content-hash",
    versionA,
    versionB,
    detectedAt: nowIso(),
    state: "unresolved",
  };
}

export function detectAllConflicts(
  lineage: VersionLineage,
): ConflictDetection[] {
  const conflicts: ConflictDetection[] = [];

  for (let i = 0; i < lineage.versions.length; i++) {
    for (let j = i + 1; j < lineage.versions.length; j++) {
      const vA = lineage.versions[i];
      const vB = lineage.versions[j];

      if (vA.contentHash !== vB.contentHash) {
        const conflict = detectContentConflict(lineage, vA.versionNumber, vB.versionNumber);
        if (conflict) conflicts.push(conflict);
      }
    }
  }

  return conflicts;
}

export function resolveConflict(
  lineage: VersionLineage,
  conflict: ConflictDetection,
  action: ResolutionAction,
): VersionResolution {
  const now = nowIso();

  if (action === "keep-latest") {
    const latest = getLatestVersion(lineage);
    return {
      conflictId: conflict.conflictId,
      resolution: action,
      winningVersion: latest?.versionNumber ?? conflict.versionB,
      resolvedAt: now,
      note: `Resolved by keeping latest version ${latest?.versionNumber ?? conflict.versionB}`,
    };
  }

  if (action === "keep-oldest") {
    return {
      conflictId: conflict.conflictId,
      resolution: action,
      winningVersion: conflict.versionA,
      resolvedAt: now,
      note: `Resolved by keeping oldest version ${conflict.versionA}`,
    };
  }

  if (action === "merge") {
    const a = getVersion(lineage, conflict.versionA);
    const b = getVersion(lineage, conflict.versionB);
    const mergedContent = a && b
      ? `--- Merged from v${conflict.versionA} and v${conflict.versionB} ---\n${a.content}\n\n${b.content}`
      : "";
    const mergedHash = fnv1a36(mergedContent);

    return {
      conflictId: conflict.conflictId,
      resolution: action,
      mergedContent,
      resolvedAt: now,
      note: `Merged versions ${conflict.versionA} and ${conflict.versionB} (hash: ${mergedHash})`,
    };
  }

  return {
    conflictId: conflict.conflictId,
    resolution: action,
    resolvedAt: now,
    note: "Manual resolution",
  };
}
