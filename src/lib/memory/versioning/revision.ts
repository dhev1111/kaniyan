/**
 * M5.8 – Memory revision operations.
 * High-level operations for revising memory records: content updates,
 * confidence changes, status transitions, version restoration.
 */

import type {
  MemoryConfidence,
  MemoryStatus,
} from "../types";
import type {
  VersionRecord,
  VersionLineage,
  VersionDiff,
  VersionError,
} from "./types";
import {
  createVersionRecord,
  addVersionToLineage,
  getVersion,
} from "./lineage";

export interface RevisionInput {
  lineage: VersionLineage;
  content?: string;
  confidence?: MemoryConfidence;
  status?: MemoryStatus;
  changeNote?: string;
}

export type RevisionResult =
  | { ok: true; lineage: VersionLineage; record: VersionRecord; diff: VersionDiff }
  | { ok: false; error: VersionError };

export function reviseMemory(input: RevisionInput): RevisionResult {
  const { lineage, content, confidence, status, changeNote } = input;
  const latest = lineage.versions[lineage.versions.length - 1];

  const newContent = content ?? latest?.content ?? "";
  const newConfidence = confidence ?? latest?.confidence ?? "medium";
  const newStatus = status ?? latest?.status ?? "candidate";

  let changeKind: "content" | "confidence" | "status" = "content";
  if (content !== undefined && confidence === undefined && status === undefined) {
    changeKind = "content";
  } else if (confidence !== undefined && content === undefined && status === undefined) {
    changeKind = "confidence";
  } else if (status !== undefined && content === undefined && confidence === undefined) {
    changeKind = "status";
  } else if (content !== undefined) {
    changeKind = "content";
  } else {
    changeKind = "confidence";
  }

  const nextVersion = lineage.currentVersion + 1;
  const record = createVersionRecord(
    lineage.memoryId,
    nextVersion,
    newContent,
    newConfidence,
    newStatus,
    changeKind,
    lineage.currentVersion > 0 ? lineage.currentVersion : undefined,
    changeNote,
  );

  const addResult = addVersionToLineage(lineage, record);
  if (!addResult.ok) {
    return { ok: false, error: addResult.error };
  }

  const diff: VersionDiff = {
    memoryId: lineage.memoryId,
    fromVersion: lineage.currentVersion,
    toVersion: nextVersion,
    contentChanged: latest ? latest.content !== newContent : true,
    confidenceChanged: latest ? latest.confidence !== newConfidence : true,
    statusChanged: latest ? latest.status !== newStatus : true,
    contentHashBefore: latest?.contentHash ?? "",
    contentHashAfter: record.contentHash,
    confidenceBefore: latest?.confidence ?? "medium",
    confidenceAfter: newConfidence,
    statusBefore: latest?.status ?? "candidate",
    statusAfter: newStatus,
  };

  return { ok: true, lineage: addResult.lineage, record, diff };
}

export interface RestoreInput {
  lineage: VersionLineage;
  targetVersion: number;
  changeNote?: string;
}

export function restoreVersion(input: RestoreInput): RevisionResult {
  const { lineage, targetVersion, changeNote } = input;
  const target = getVersion(lineage, targetVersion);

  if (!target) {
    return {
      ok: false,
      error: {
        code: "VERSION_NOT_FOUND",
        message: `Version ${targetVersion} not found in lineage`,
        memoryId: lineage.memoryId,
        versionNumber: targetVersion,
      },
    };
  }

  return reviseMemory({
    lineage,
    content: target.content,
    confidence: target.confidence,
    status: target.status,
    changeNote: changeNote ?? `Restored from version ${targetVersion}`,
  });
}

export function computeDiff(
  lineage: VersionLineage,
  fromVersion: number,
  toVersion: number,
): { ok: true; diff: VersionDiff } | { ok: false; error: VersionError } {
  const from = getVersion(lineage, fromVersion);
  const to = getVersion(lineage, toVersion);

  if (!from) {
    return {
      ok: false,
      error: { code: "VERSION_NOT_FOUND", message: `Version ${fromVersion} not found`, memoryId: lineage.memoryId, versionNumber: fromVersion },
    };
  }
  if (!to) {
    return {
      ok: false,
      error: { code: "VERSION_NOT_FOUND", message: `Version ${toVersion} not found`, memoryId: lineage.memoryId, versionNumber: toVersion },
    };
  }

  const diff: VersionDiff = {
    memoryId: lineage.memoryId,
    fromVersion,
    toVersion,
    contentChanged: from.content !== to.content,
    confidenceChanged: from.confidence !== to.confidence,
    statusChanged: from.status !== to.status,
    contentHashBefore: from.contentHash,
    contentHashAfter: to.contentHash,
    confidenceBefore: from.confidence,
    confidenceAfter: to.confidence,
    statusBefore: from.status,
    statusAfter: to.status,
  };

  return { ok: true, diff };
}

export function compareVersions(
  a: VersionRecord,
  b: VersionRecord,
): { same: boolean; diffs: string[] } {
  const diffs: string[] = [];

  if (a.contentHash !== b.contentHash) diffs.push("content");
  if (a.confidence !== b.confidence) diffs.push("confidence");
  if (a.status !== b.status) diffs.push("status");

  return { same: diffs.length === 0, diffs };
}
