/**
 * M5.8 – Memory versioning & evolution tests.
 * Comprehensive coverage of types, lineage, revision, integrity,
 * and conflict modules. All tests are deterministic.
 */

import { MEMORY_LIMITS } from "../../limits";
import { fnv1a36 } from "../../util";
import type {
  MemoryConfidence,
  MemoryStatus,
} from "../../types";
import type {
  VersionRecord,
  VersionLineage,
  ConflictDetection,
} from "../types";
import {
  createVersionRecord,
  createLineage,
  addVersionToLineage,
  getVersion,
  getLatestVersion,
  getVersionHistory,
  detectCycles,
  validateLineageIntegrity,
} from "../lineage";
import {
  reviseMemory,
  restoreVersion,
  computeDiff,
  compareVersions,
} from "../revision";
import {
  verifyVersionIntegrity,
  verifyLineageIntegrity,
  detectTampering,
} from "../integrity";
import {
  detectContentConflict,
  detectAllConflicts,
  resolveConflict,
} from "../conflicts";

function makeRecord(
  memoryId: string,
  version: number,
  content: string = `content-v${version}`,
  confidence: MemoryConfidence = "medium",
  status: MemoryStatus = "stored",
  parentVersion?: number,
): VersionRecord {
  return createVersionRecord(
    memoryId,
    version,
    content,
    confidence,
    status,
    "content",
    parentVersion,
  );
}

function buildLineage(memoryId: string, count: number): VersionLineage {
  let lineage = createLineage(memoryId);
  for (let i = 1; i <= count; i++) {
    const record = makeRecord(memoryId, i, `content-v${i}`, "medium", "stored", i > 1 ? i - 1 : undefined);
    const result = addVersionToLineage(lineage, record);
    if (result.ok) lineage = result.lineage;
  }
  return lineage;
}

// ─── LINEAGE TESTS ───────────────────────────────────────────────────────────

describe("M5.8 – Versioning", () => {
  describe("createVersionRecord", () => {
    it("creates a record with correct fields", () => {
      const record = createVersionRecord("mem-001", 1, "hello", "medium", "stored", "content");
      expect(record.memoryId).toBe("mem-001");
      expect(record.versionNumber).toBe(1);
      expect(record.contentHash).toBe(fnv1a36("hello"));
      expect(record.content).toBe("hello");
      expect(record.confidence).toBe("medium");
      expect(record.status).toBe("stored");
      expect(record.changeKind).toBe("content");
      expect(record.parentVersion).toBeUndefined();
      expect(record.createdAt).toBeTruthy();
    });

    it("includes parentVersion and changeNote when provided", () => {
      const record = createVersionRecord(
        "mem-001", 2, "updated", "high", "retrievable",
        "confidence", 1, "Improved confidence",
      );
      expect(record.parentVersion).toBe(1);
      expect(record.changeNote).toBe("Improved confidence");
      expect(record.changeKind).toBe("confidence");
    });

    it("produces deterministic content hash", () => {
      const r1 = createVersionRecord("m", 1, "same", "medium", "stored", "content");
      const r2 = createVersionRecord("m", 2, "same", "medium", "stored", "content", undefined, "note");
      expect(r1.contentHash).toBe(r2.contentHash);
    });
  });

  describe("createLineage", () => {
    it("creates an empty lineage", () => {
      const lineage = createLineage("mem-001");
      expect(lineage.memoryId).toBe("mem-001");
      expect(lineage.currentVersion).toBe(0);
      expect(lineage.versions).toHaveLength(0);
      expect(lineage.createdAt).toBeTruthy();
      expect(lineage.updatedAt).toBe(lineage.createdAt);
    });
  });

  describe("addVersionToLineage", () => {
    it("adds v1 to empty lineage", () => {
      const lineage = createLineage("mem-001");
      const record = makeRecord("mem-001", 1);
      const result = addVersionToLineage(lineage, record);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.lineage.currentVersion).toBe(1);
        expect(result.lineage.versions).toHaveLength(1);
        expect(result.lineage.versions[0]).toBe(record);
      }
    });

    it("adds sequential versions", () => {
      const lineage = buildLineage("mem-001", 3);
      expect(lineage.currentVersion).toBe(3);
      expect(lineage.versions).toHaveLength(3);
    });

    it("rejects non-sequential version number", () => {
      const lineage = createLineage("mem-001");
      const record = makeRecord("mem-001", 5);
      const result = addVersionToLineage(lineage, record);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_VERSION_NUMBER");
      }
    });

    it("rejects version 0", () => {
      const lineage = createLineage("mem-001");
      const record = makeRecord("mem-001", 0);
      const result = addVersionToLineage(lineage, record);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_VERSION_NUMBER");
      }
    });

    it("enforces depth limit", () => {
      let lineage = createLineage("mem-001");
      for (let i = 1; i <= MEMORY_LIMITS.MAX_VERSION_LINEAGE_DEPTH; i++) {
        const record = makeRecord("mem-001", i, `v${i}`, "medium", "stored", i > 1 ? i - 1 : undefined);
        const result = addVersionToLineage(lineage, record);
        expect(result.ok).toBe(true);
        if (result.ok) lineage = result.lineage;
      }
      const overflowRecord = makeRecord("mem-001", MEMORY_LIMITS.MAX_VERSION_LINEAGE_DEPTH + 1);
      const result = addVersionToLineage(lineage, overflowRecord);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("LINEAGE_DEPTH_EXCEEDED");
      }
    });

    it("rejects missing parent for v2+", () => {
      let lineage = createLineage("mem-001");
      const v1 = makeRecord("mem-001", 1);
      const r1 = addVersionToLineage(lineage, v1);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const v2 = makeRecord("mem-001", 2);
      const r2 = addVersionToLineage(lineage, v2);
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.error.code).toBe("PARENT_NOT_FOUND");
      }
    });

    it("rejects nonexistent parent version", () => {
      let lineage = createLineage("mem-001");
      const v1 = makeRecord("mem-001", 1);
      const r1 = addVersionToLineage(lineage, v1);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const v2 = makeRecord("mem-001", 2, "v2", "medium", "stored", 99);
      const r2 = addVersionToLineage(lineage, v2);
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.error.code).toBe("PARENT_NOT_FOUND");
      }
    });

    it("rejects duplicate version number", () => {
      let lineage = createLineage("mem-001");
      const v1 = makeRecord("mem-001", 1);
      const r1 = addVersionToLineage(lineage, v1);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const v1dup = makeRecord("mem-001", 1);
      const r2 = addVersionToLineage(lineage, v1dup);
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.error.code).toBe("INVALID_VERSION_NUMBER");
      }
    });
  });

  describe("getVersion / getLatestVersion / getVersionHistory", () => {
    it("retrieves specific version", () => {
      const lineage = buildLineage("mem-001", 5);
      const v3 = getVersion(lineage, 3);
      expect(v3).toBeDefined();
      expect(v3?.versionNumber).toBe(3);
      expect(v3?.content).toBe("content-v3");
    });

    it("returns undefined for missing version", () => {
      const lineage = buildLineage("mem-001", 3);
      expect(getVersion(lineage, 99)).toBeUndefined();
    });

    it("getLatestVersion returns last version", () => {
      const lineage = buildLineage("mem-001", 5);
      const latest = getLatestVersion(lineage);
      expect(latest?.versionNumber).toBe(5);
    });

    it("getLatestVersion returns undefined for empty lineage", () => {
      const lineage = createLineage("mem-001");
      expect(getLatestVersion(lineage)).toBeUndefined();
    });

    it("getVersionHistory returns newest-first order", () => {
      const lineage = buildLineage("mem-001", 4);
      const history = getVersionHistory(lineage);
      expect(history.map(v => v.versionNumber)).toEqual([4, 3, 2, 1]);
    });

    it("getVersionHistory respects limit", () => {
      const lineage = buildLineage("mem-001", 5);
      const history = getVersionHistory(lineage, 2);
      expect(history.map(v => v.versionNumber)).toEqual([5, 4]);
    });
  });

  describe("detectCycles", () => {
    it("returns false for valid lineage", () => {
      const lineage = buildLineage("mem-001", 10);
      expect(detectCycles(lineage)).toBe(false);
    });

    it("returns false for empty lineage", () => {
      const lineage = createLineage("mem-001");
      expect(detectCycles(lineage)).toBe(false);
    });
  });

  describe("validateLineageIntegrity", () => {
    it("valid lineage passes", () => {
      const lineage = buildLineage("mem-001", 5);
      const result = validateLineageIntegrity(lineage);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("empty lineage passes", () => {
      const lineage = createLineage("mem-001");
      const result = validateLineageIntegrity(lineage);
      expect(result.isValid).toBe(true);
    });

    it("detects version number mismatch", () => {
      let lineage = createLineage("mem-001");
      const v1 = makeRecord("mem-001", 1);
      const r1 = addVersionToLineage(lineage, v1);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const tampered = [...lineage.versions];
      tampered[0] = { ...tampered[0], versionNumber: 99 };
      const tamperedLineage = { ...lineage, versions: tampered, currentVersion: 2 };

      const result = validateLineageIntegrity(tamperedLineage);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === "INVALID_VERSION_NUMBER")).toBe(true);
    });

    it("detects missing parent", () => {
      let lineage = createLineage("mem-001");
      const v1 = makeRecord("mem-001", 1);
      const r1 = addVersionToLineage(lineage, v1);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const v2 = makeRecord("mem-001", 2, "v2", "medium", "stored", 99);
      const r2 = addVersionToLineage(lineage, v2);
      expect(r2.ok).toBe(false);
    });
  });

  // ─── REVISION TESTS ──────────────────────────────────────────────────────

  describe("reviseMemory", () => {
    it("creates first version", () => {
      const lineage = createLineage("mem-001");
      const result = reviseMemory({
        lineage,
        content: "initial content",
        confidence: "medium",
        status: "stored",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.lineage.currentVersion).toBe(1);
        expect(result.record.content).toBe("initial content");
        expect(result.diff.contentChanged).toBe(true);
        expect(result.diff.fromVersion).toBe(0);
        expect(result.diff.toVersion).toBe(1);
      }
    });

    it("creates sequential revisions", () => {
      let lineage = createLineage("mem-001");

      const r1 = reviseMemory({ lineage, content: "v1", confidence: "medium", status: "stored" });
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const r2 = reviseMemory({ lineage, content: "v2", confidence: "high", status: "stored", changeNote: "improved" });
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      lineage = r2.lineage;

      expect(lineage.currentVersion).toBe(2);
      expect(lineage.versions[1].content).toBe("v2");
      expect(lineage.versions[1].changeKind).toBe("content");
      expect(lineage.versions[1].changeNote).toBe("improved");
    });

    it("detects confidence-only change", () => {
      let lineage = createLineage("mem-001");
      const r1 = reviseMemory({ lineage, content: "v1", confidence: "low", status: "stored" });
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const r2 = reviseMemory({ lineage, confidence: "high" });
      expect(r2.ok).toBe(true);
      if (r2.ok) {
        expect(r2.record.changeKind).toBe("confidence");
        expect(r2.diff.confidenceChanged).toBe(true);
        expect(r2.diff.contentChanged).toBe(false);
        expect(r2.diff.statusChanged).toBe(false);
      }
    });

    it("detects status-only change", () => {
      let lineage = createLineage("mem-001");
      const r1 = reviseMemory({ lineage, content: "v1", confidence: "medium", status: "candidate" });
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const r2 = reviseMemory({ lineage, status: "retrievable" });
      expect(r2.ok).toBe(true);
      if (r2.ok) {
        expect(r2.record.changeKind).toBe("status");
        expect(r2.diff.statusChanged).toBe(true);
      }
    });
  });

  describe("restoreVersion", () => {
    it("restores a previous version as new version", () => {
      const lineage = buildLineage("mem-001", 3);

      const result = restoreVersion({ lineage, targetVersion: 1, changeNote: "restoring v1" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.lineage.currentVersion).toBe(4);
        expect(result.record.content).toBe("content-v1");
        expect(result.record.changeNote).toBe("restoring v1");
      }
    });

    it("fails for nonexistent version", () => {
      const lineage = buildLineage("mem-001", 3);
      const result = restoreVersion({ lineage, targetVersion: 99 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VERSION_NOT_FOUND");
      }
    });
  });

  describe("computeDiff", () => {
    it("computes diff between two versions", () => {
      const lineage = buildLineage("mem-001", 5);
      const result = computeDiff(lineage, 2, 4);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.diff.fromVersion).toBe(2);
        expect(result.diff.toVersion).toBe(4);
        expect(result.diff.contentChanged).toBe(true);
      }
    });

    it("detects no difference for same version", () => {
      const lineage = buildLineage("mem-001", 3);
      const result = computeDiff(lineage, 2, 2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.diff.contentChanged).toBe(false);
        expect(result.diff.confidenceChanged).toBe(false);
        expect(result.diff.statusChanged).toBe(false);
      }
    });

    it("fails for missing version", () => {
      const lineage = buildLineage("mem-001", 3);
      const result = computeDiff(lineage, 2, 99);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VERSION_NOT_FOUND");
      }
    });
  });

  describe("compareVersions", () => {
    it("detects identical versions", () => {
      const a = makeRecord("m", 1, "same", "medium", "stored");
      const b = makeRecord("m", 2, "same", "medium", "stored");
      const result = compareVersions(a, b);
      expect(result.same).toBe(true);
      expect(result.diffs).toHaveLength(0);
    });

    it("detects content difference", () => {
      const a = makeRecord("m", 1, "content-a", "medium", "stored");
      const b = makeRecord("m", 2, "content-b", "medium", "stored");
      const result = compareVersions(a, b);
      expect(result.same).toBe(false);
      expect(result.diffs).toContain("content");
    });

    it("detects confidence difference", () => {
      const a = makeRecord("m", 1, "same", "low", "stored");
      const b = makeRecord("m", 2, "same", "high", "stored");
      const result = compareVersions(a, b);
      expect(result.same).toBe(false);
      expect(result.diffs).toContain("confidence");
    });

    it("detects status difference", () => {
      const a = makeRecord("m", 1, "same", "medium", "candidate");
      const b = makeRecord("m", 2, "same", "medium", "archived");
      const result = compareVersions(a, b);
      expect(result.same).toBe(false);
      expect(result.diffs).toContain("status");
    });

    it("detects multiple differences", () => {
      const a = makeRecord("m", 1, "a", "low", "candidate");
      const b = makeRecord("m", 2, "b", "high", "archived");
      const result = compareVersions(a, b);
      expect(result.same).toBe(false);
      expect(result.diffs).toHaveLength(3);
    });
  });

  // ─── INTEGRITY TESTS ─────────────────────────────────────────────────────

  describe("integrity", () => {
    it("valid version passes integrity check", () => {
      const lineage = buildLineage("mem-001", 3);
      const result = verifyVersionIntegrity(lineage, 2);
      expect(result.isValid).toBe(true);
      expect(result.tamperedVersions).toHaveLength(0);
    });

    it("missing version fails integrity check", () => {
      const lineage = buildLineage("mem-001", 3);
      const result = verifyVersionIntegrity(lineage, 99);
      expect(result.isValid).toBe(false);
    });

    it("tampered content hash detected", () => {
      const lineage = buildLineage("mem-001", 3);
      const tamperedVersions = [...lineage.versions];
      tamperedVersions[1] = { ...tamperedVersions[1], contentHash: "tampered-hash" };
      const tamperedLineage = { ...lineage, versions: tamperedVersions };

      const result = verifyVersionIntegrity(tamperedLineage, 2);
      expect(result.isValid).toBe(false);
      expect(result.tamperedVersions).toContain(2);
    });

    it("verifyLineageIntegrity checks all versions", () => {
      const lineage = buildLineage("mem-001", 5);
      const result = verifyLineageIntegrity(lineage);
      expect(result.isValid).toBe(true);
      expect(result.tamperedVersions).toHaveLength(0);
    });

    it("verifyLineageIntegrity detects tampered versions", () => {
      const lineage = buildLineage("mem-001", 5);
      const tamperedVersions = [...lineage.versions];
      tamperedVersions[2] = { ...tamperedVersions[2], contentHash: "wrong" };
      tamperedVersions[4] = { ...tamperedVersions[4], contentHash: "also-wrong" };
      const tamperedLineage = { ...lineage, versions: tamperedVersions };

      const result = verifyLineageIntegrity(tamperedLineage);
      expect(result.isValid).toBe(false);
      expect(result.tamperedVersions).toContain(3);
      expect(result.tamperedVersions).toContain(5);
    });

    it("detectTampering returns false for valid lineage", () => {
      const lineage = buildLineage("mem-001", 4);
      const result = detectTampering(lineage);
      expect(result.tampered).toBe(false);
      expect(result.tamperedVersions).toHaveLength(0);
    });

    it("detectTampering returns true for tampered lineage", () => {
      const lineage = buildLineage("mem-001", 4);
      const tamperedVersions = [...lineage.versions];
      tamperedVersions[0] = { ...tamperedVersions[0], contentHash: "tampered" };
      const tamperedLineage = { ...lineage, versions: tamperedVersions };

      const result = detectTampering(tamperedLineage);
      expect(result.tampered).toBe(true);
      expect(result.tamperedVersions).toContain(1);
    });
  });

  // ─── CONFLICT TESTS ──────────────────────────────────────────────────────

  describe("conflicts", () => {
    it("detects content conflict", () => {
      let lineage = createLineage("mem-001");
      const v1 = makeRecord("mem-001", 1, "content-a");
      const r1 = addVersionToLineage(lineage, v1);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const v2 = makeRecord("mem-001", 2, "content-b", "medium", "stored", 1);
      const r2 = addVersionToLineage(lineage, v2);
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      lineage = r2.lineage;

      const conflict = detectContentConflict(lineage, 1, 2);
      expect(conflict).toBeDefined();
      expect(conflict?.state).toBe("unresolved");
      expect(conflict?.strategy).toBe("content-hash");
    });

    it("no conflict for identical content", () => {
      let lineage = createLineage("mem-001");
      const v1 = makeRecord("mem-001", 1, "same-content");
      const r1 = addVersionToLineage(lineage, v1);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const v2 = makeRecord("mem-001", 2, "same-content", "medium", "stored", 1);
      const r2 = addVersionToLineage(lineage, v2);
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      lineage = r2.lineage;

      const conflict = detectContentConflict(lineage, 1, 2);
      expect(conflict).toBeUndefined();
    });

    it("no conflict for missing versions", () => {
      const lineage = buildLineage("mem-001", 3);
      const conflict = detectContentConflict(lineage, 99, 100);
      expect(conflict).toBeUndefined();
    });

    it("detectAllConflicts finds all conflicting pairs", () => {
      let lineage = createLineage("mem-001");
      const v1 = makeRecord("mem-001", 1, "a");
      const r1 = addVersionToLineage(lineage, v1);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const v2 = makeRecord("mem-001", 2, "b", "medium", "stored", 1);
      const r2 = addVersionToLineage(lineage, v2);
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      lineage = r2.lineage;

      const v3 = makeRecord("mem-001", 3, "c", "medium", "stored", 2);
      const r3 = addVersionToLineage(lineage, v3);
      expect(r3.ok).toBe(true);
      if (!r3.ok) return;
      lineage = r3.lineage;

      const conflicts = detectAllConflicts(lineage);
      expect(conflicts.length).toBe(3);
    });

    it("no conflicts for identical content versions", () => {
      let lineage = createLineage("mem-001");
      const v1 = makeRecord("mem-001", 1, "same-content");
      const r1 = addVersionToLineage(lineage, v1);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      const v2 = makeRecord("mem-001", 2, "same-content", "medium", "stored", 1);
      const r2 = addVersionToLineage(lineage, v2);
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      lineage = r2.lineage;

      const v3 = makeRecord("mem-001", 3, "same-content", "medium", "stored", 2);
      const r3 = addVersionToLineage(lineage, v3);
      expect(r3.ok).toBe(true);
      if (!r3.ok) return;
      lineage = r3.lineage;

      const conflicts = detectAllConflicts(lineage);
      expect(conflicts.length).toBe(0);
    });
  });

  describe("resolveConflict", () => {
    it("keep-latest resolves to latest version", () => {
      const lineage = buildLineage("mem-001", 3);
      const conflict = detectContentConflict(lineage, 1, 3) ??
        { conflictId: "c1", memoryId: "mem-001", strategy: "content-hash", versionA: 1, versionB: 3, detectedAt: new Date().toISOString(), state: "unresolved" };

      const resolution = resolveConflict(lineage, conflict, "keep-latest");
      expect(resolution.resolution).toBe("keep-latest");
      expect(resolution.winningVersion).toBe(3);
      expect(resolution.conflictId).toBe(conflict.conflictId);
    });

    it("keep-oldest resolves to oldest version", () => {
      const lineage = buildLineage("mem-001", 3);
      const conflict: ConflictDetection = {
        conflictId: "c1",
        memoryId: "mem-001",
        strategy: "content-hash",
        versionA: 1,
        versionB: 3,
        detectedAt: new Date().toISOString(),
        state: "unresolved",
      };

      const resolution = resolveConflict(lineage, conflict, "keep-oldest");
      expect(resolution.resolution).toBe("keep-oldest");
      expect(resolution.winningVersion).toBe(1);
    });

    it("merge produces merged content", () => {
      const lineage = buildLineage("mem-001", 3);
      const conflict: ConflictDetection = {
        conflictId: "c1",
        memoryId: "mem-001",
        strategy: "content-hash",
        versionA: 1,
        versionB: 3,
        detectedAt: new Date().toISOString(),
        state: "unresolved",
      };

      const resolution = resolveConflict(lineage, conflict, "merge");
      expect(resolution.resolution).toBe("merge");
      expect(resolution.mergedContent).toContain("content-v1");
      expect(resolution.mergedContent).toContain("content-v3");
    });

    it("manual resolution records manual action", () => {
      const lineage = buildLineage("mem-001", 3);
      const conflict: ConflictDetection = {
        conflictId: "c1",
        memoryId: "mem-001",
        strategy: "content-hash",
        versionA: 1,
        versionB: 3,
        detectedAt: new Date().toISOString(),
        state: "unresolved",
      };

      const resolution = resolveConflict(lineage, conflict, "manual");
      expect(resolution.resolution).toBe("manual");
      expect(resolution.note).toBe("Manual resolution");
    });
  });

  // ─── LIMITS TESTS ────────────────────────────────────────────────────────

  describe("limits", () => {
    it("MAX_VERSION_LINEAGE_DEPTH is defined", () => {
      expect(typeof MEMORY_LIMITS.MAX_VERSION_LINEAGE_DEPTH).toBe("number");
      expect(MEMORY_LIMITS.MAX_VERSION_LINEAGE_DEPTH).toBeGreaterThan(0);
    });

    it("MAX_VERSION_HISTORY_SCAN is defined", () => {
      expect(typeof MEMORY_LIMITS.MAX_VERSION_HISTORY_SCAN).toBe("number");
      expect(MEMORY_LIMITS.MAX_VERSION_HISTORY_SCAN).toBeGreaterThan(0);
    });

    it("MAX_CONFLICTS_PER_LINEAGE is defined", () => {
      expect(typeof MEMORY_LIMITS.MAX_CONFLICTS_PER_LINEAGE).toBe("number");
      expect(MEMORY_LIMITS.MAX_CONFLICTS_PER_LINEAGE).toBeGreaterThan(0);
    });
  });

  // ─── EDGE CASES ──────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles single-version lineage throughout lifecycle", () => {
      let lineage = createLineage("mem-001");
      const r1 = reviseMemory({ lineage, content: "only version", confidence: "high", status: "stored" });
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      lineage = r1.lineage;

      expect(getLatestVersion(lineage)?.content).toBe("only version");
      expect(getVersionHistory(lineage)).toHaveLength(1);

      const integrity = verifyLineageIntegrity(lineage);
      expect(integrity.isValid).toBe(true);
    });

    it("handles large lineage within limits", () => {
      const maxDepth = MEMORY_LIMITS.MAX_VERSION_LINEAGE_DEPTH;
      const lineage = buildLineage("mem-001", maxDepth);
      expect(lineage.currentVersion).toBe(maxDepth);
      expect(lineage.versions).toHaveLength(maxDepth);

      const integrity = validateLineageIntegrity(lineage);
      expect(integrity.isValid).toBe(true);
    });

    it("version history reverses correctly at various sizes", () => {
      for (const size of [1, 2, 5, 10, 20]) {
        const lineage = buildLineage("mem-001", size);
        const history = getVersionHistory(lineage);
        expect(history).toHaveLength(size);
        for (let i = 0; i < history.length - 1; i++) {
          expect(history[i].versionNumber).toBeGreaterThan(history[i + 1].versionNumber);
        }
      }
    });

    it("diff shows no changes when comparing same version to itself", () => {
      const lineage = buildLineage("mem-001", 5);
      const diff = computeDiff(lineage, 3, 3);
      expect(diff.ok).toBe(true);
      if (diff.ok) {
        expect(diff.diff.contentChanged).toBe(false);
        expect(diff.diff.confidenceChanged).toBe(false);
        expect(diff.diff.statusChanged).toBe(false);
      }
    });

    it("multiple content changes produce correct diffs", () => {
      const lineage = buildLineage("mem-001", 5);
      const diff = computeDiff(lineage, 1, 5);
      expect(diff.ok).toBe(true);
      if (diff.ok) {
        expect(diff.diff.contentChanged).toBe(true);
        expect(diff.diff.fromVersion).toBe(1);
        expect(diff.diff.toVersion).toBe(5);
      }
    });
  });
});
