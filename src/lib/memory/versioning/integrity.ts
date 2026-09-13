/**
 * M5.8 – Version integrity verification.
 * Detects tampering by recomputing content hashes and
 * verifying they match stored values.
 */

import { fnv1a36 } from "../util";
import { getVersion, getLatestVersion } from "./lineage";
import type { VersionLineage, IntegrityResult } from "./types";

export function verifyVersionIntegrity(
  lineage: VersionLineage,
  versionNumber: number,
): IntegrityResult {
  const record = getVersion(lineage, versionNumber);

  if (!record) {
    return {
      memoryId: lineage.memoryId,
      isValid: false,
      expectedHash: "",
      actualHash: "",
      tamperedVersions: [versionNumber],
      checkedAt: new Date().toISOString(),
    };
  }

  const recomputed = fnv1a36(record.content);

  return {
    memoryId: lineage.memoryId,
    isValid: recomputed === record.contentHash,
    expectedHash: record.contentHash,
    actualHash: recomputed,
    tamperedVersions: recomputed !== record.contentHash ? [versionNumber] : [],
    checkedAt: new Date().toISOString(),
  };
}

export function verifyLineageIntegrity(
  lineage: VersionLineage,
): IntegrityResult {
  const tamperedVersions: number[] = [];
  let expectedHash = "";
  let actualHash = "";

  for (const record of lineage.versions) {
    const recomputed = fnv1a36(record.content);
    if (recomputed !== record.contentHash) {
      tamperedVersions.push(record.versionNumber);
      expectedHash = record.contentHash;
      actualHash = recomputed;
    }
  }

  const latest = getLatestVersion(lineage);

  return {
    memoryId: lineage.memoryId,
    isValid: tamperedVersions.length === 0,
    expectedHash: tamperedVersions.length > 0 ? expectedHash : (latest?.contentHash ?? ""),
    actualHash: tamperedVersions.length > 0 ? actualHash : (latest ? fnv1a36(latest.content) : ""),
    tamperedVersions,
    checkedAt: new Date().toISOString(),
  };
}

export function detectTampering(
  lineage: VersionLineage,
): { tampered: boolean; tamperedVersions: number[] } {
  const tamperedVersions: number[] = [];

  for (const record of lineage.versions) {
    const recomputed = fnv1a36(record.content);
    if (recomputed !== record.contentHash) {
      tamperedVersions.push(record.versionNumber);
    }
  }

  return {
    tampered: tamperedVersions.length > 0,
    tamperedVersions,
  };
}
