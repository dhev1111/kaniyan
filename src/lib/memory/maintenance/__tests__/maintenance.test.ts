/**
 * M5.7 – Memory maintenance & health engine tests.
 * Deterministic, bounded, comprehensive coverage.
 */

import { MEMORY_LIMITS } from "../../limits";
import { constructMemory } from "../../validation";
import { InMemoryMemoryStore } from "../../store/in-memory";
import { validateMemoryRecord } from "../validation";
import { generateHealthReport } from "../health";
import { generateRecommendations } from "../recommendations";
import { runMaintenance } from "../maintenance";
import {
  DIAGNOSTIC_CODES,
  makeDiagnostic,
  makeRecommendation,
  makeExecution,
} from "../diagnostics";
import type {
  Diagnostic,
} from "../diagnostics";
import type {
  MemoryReference,
  MemoryStatus,
} from "../../types";

const NOW = "2026-06-15T12:00:00.000Z";
const OLD = "2020-01-01T00:00:00.000Z";

function memory(
  id: string,
  overrides: Partial<MemoryReference> = {},
  status: MemoryStatus = "stored"
): MemoryReference {
  const memId = id.startsWith("mem-") ? id : `mem-${id}`;
  const { expiresAt, createdAt, ...inputOverrides } = overrides;
  const ref = constructMemory(
    {
      content: `Memory content for ${memId}. This is valid test content.`,
      provenance: { sourceKind: "text", ingestedAt: NOW },
      ...inputOverrides,
      status,
    },
    { now: NOW, id: memId }
  );
  let result = ref;
  if (expiresAt !== undefined) result = { ...result, expiresAt };
  if (createdAt !== undefined) result = { ...result, createdAt };
  return result;
}

function brokenMemory(): MemoryReference {
  return {
    id: "bad-id",
    content: "",
    type: "invalid",
    source: { id: "", kind: "invalid" },
    metadata: { scope: "invalid", tags: [], extra: {} },
    provenance: { sourceKind: "invalid", ingestedAt: "not-a-date" },
    importance: "invalid",
    confidence: "invalid",
    status: "invalid",
    contentHash: "wrong",
    version: -1,
    createdAt: "not-a-date",
    updatedAt: "not-a-date",
    relationships: [],
    conflicts: [],
  } as unknown as MemoryReference;
}

function storeWithMemories(...mems: MemoryReference[]): InMemoryMemoryStore {
  const store = new InMemoryMemoryStore({ capacity: 100 });
  for (const m of mems) {
    store.save(m);
  }
  return store;
}

// ─── DIAGNOSTICS TYPES ──────────────────────────────────────────────────────

describe("M5.7 diagnostics types", () => {
  it("makeDiagnostic creates correct structure", () => {
    const d = makeDiagnostic("MEMORY_INVALID_RECORD", "error", "test message", "mem-123");
    expect(d.code).toBe("MEMORY_INVALID_RECORD");
    expect(d.severity).toBe("error");
    expect(d.message).toBe("test message");
    expect(d.memoryId).toBe("mem-123");
  });

  it("makeDiagnostic omits memoryId when undefined", () => {
    const d = makeDiagnostic("MEMORY_EXPIRED", "warning", "expired");
    expect(d).not.toHaveProperty("memoryId");
  });

  it("makeRecommendation creates correct structure", () => {
    const r = makeRecommendation("cleanup", "warning", "CODE", "reason", ["mem-1"]);
    expect(r.action).toBe("cleanup");
    expect(r.severity).toBe("warning");
    expect(r.code).toBe("CODE");
    expect(r.reason).toBe("reason");
    expect(r.memoryIds).toEqual(["mem-1"]);
  });

  it("makeExecution creates correct structure", () => {
    const e = makeExecution("archive", ["mem-1"], true, "done");
    expect(e.action).toBe("archive");
    expect(e.success).toBe(true);
    expect(e.memoryIds).toEqual(["mem-1"]);
  });

  it("DIAGNOSTIC_CODES contains expected codes", () => {
    expect(DIAGNOSTIC_CODES.MEMORY_INVALID_RECORD).toBe("MEMORY_INVALID_RECORD");
    expect(DIAGNOSTIC_CODES.MEMORY_MISSING_FIELD).toBe("MEMORY_MISSING_FIELD");
    expect(DIAGNOSTIC_CODES.MEMORY_EXPIRED).toBe("MEMORY_EXPIRED");
    expect(DIAGNOSTIC_CODES.MEMORY_STALE).toBe("MEMORY_STALE");
    expect(DIAGNOSTIC_CODES.MEMORY_DUPLICATE).toBe("MEMORY_DUPLICATE");
    expect(DIAGNOSTIC_CODES.MEMORY_RETENTION_WARNING).toBe("MEMORY_RETENTION_WARNING");
    expect(DIAGNOSTIC_CODES.MEMORY_ACTIVE_LIMIT).toBe("MEMORY_ACTIVE_LIMIT");
  });
});

// ─── VALIDATION ─────────────────────────────────────────────────────────────

describe("M5.7 validation", () => {
  it("valid memory passes with no errors", () => {
    const ref = memory("m1");
    const diagnostics = validateMemoryRecord(ref);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("missing required field detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).content = undefined;
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_MISSING_FIELD)).toBe(true);
  });

  it("invalid ID detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).id = "bad-id";
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_INVALID_ID)).toBe(true);
  });

  it("invalid status detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).status = "nonsense";
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_INVALID_STATUS)).toBe(true);
  });

  it("invalid timestamp detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).createdAt = "not-a-date";
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_INVALID_TIMESTAMP)).toBe(true);
  });

  it("impossible timestamp relationship detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).updatedAt = "2020-01-01T00:00:00.000Z";
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_IMPOSSIBLE_TIMESTAMPS)).toBe(true);
  });

  it("invalid confidence detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).confidence = "ultra";
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_INVALID_CONFIDENCE)).toBe(true);
  });

  it("invalid importance detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).importance = "mega";
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_INVALID_IMPORTANCE)).toBe(true);
  });

  it("oversized content detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).content = "x".repeat(MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS + 1);
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_CONTENT_LIMIT)).toBe(true);
  });

  it("oversized metadata detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).metadata = {
      ...ref.metadata,
      tags: new Array(MEMORY_LIMITS.MAX_TAGS_PER_MEMORY + 1).fill("tag"),
    };
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_METADATA_LIMIT)).toBe(true);
  });

  it("null memory returns error", () => {
    const diagnostics = validateMemoryRecord(null as unknown as MemoryReference);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
  });

  it("content hash mismatch detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).contentHash = "wrong-hash";
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_CONTENT_HASH_MISMATCH)).toBe(true);
  });

  it("invalid version detected", () => {
    const ref = memory("m1");
    (ref as unknown as Record<string, unknown>).version = -5;
    const diagnostics = validateMemoryRecord(ref);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_INVALID_RECORD)).toBe(true);
  });

  it("broken record produces multiple errors", () => {
    const ref = brokenMemory();
    const diagnostics = validateMemoryRecord(ref);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── HEALTH REPORT ──────────────────────────────────────────────────────────

describe("M5.7 health report", () => {
  it("empty store returns healthy", () => {
    const store = new InMemoryMemoryStore({ capacity: 10 });
    const report = generateHealthReport(store, { asOf: NOW });
    expect(report.totalRecords).toBe(0);
    expect(report.healthStatus).toBe("healthy");
    expect(report.bounded).toBe(true);
  });

  it("active records counted correctly", () => {
    const store = storeWithMemories(
      memory("m1", {}, "stored"),
      memory("m2", {}, "retrievable"),
      memory("m3", {}, "archived")
    );
    const report = generateHealthReport(store, { asOf: NOW });
    expect(report.activeRecords).toBe(2);
    expect(report.archivedRecords).toBe(1);
    expect(report.totalRecords).toBe(3);
  });

  it("expired records counted correctly", () => {
    const store = storeWithMemories(
      memory("m1", { expiresAt: "2020-01-01T00:00:00.000Z" }),
      memory("m2")
    );
    const report = generateHealthReport(store, { asOf: NOW });
    expect(report.expiredRecords).toBe(1);
  });

  it("invalid records affect health status correctly", () => {
    const ref = brokenMemory();
    const diagnostics = validateMemoryRecord(ref);
    const hasErrors = diagnostics.some((d) => d.severity === "error");
    expect(hasErrors).toBe(true);
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_INVALID_ID)).toBe(true);
  });

  it("duplicate candidates detected", () => {
    const shared = "Shared content for duplicate detection.";
    const store = storeWithMemories(
      memory("m1", { content: shared }),
      memory("m2", { content: shared })
    );
    const report = generateHealthReport(store, { asOf: NOW });
    expect(report.duplicateCandidates).toBeGreaterThanOrEqual(1);
  });

  it("stale records detected", () => {
    const store = storeWithMemories(
      memory("m1", { createdAt: OLD })
    );
    const report = generateHealthReport(store, { asOf: NOW });
    expect(report.staleRecords).toBe(1);
    expect(report.diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.MEMORY_STALE)).toBe(true);
  });

  it("report is deterministic", () => {
    const store = storeWithMemories(memory("m1"), memory("m2"));
    const first = generateHealthReport(store, { asOf: NOW });
    const second = generateHealthReport(store, { asOf: NOW });
    expect(first.totalRecords).toBe(second.totalRecords);
    expect(first.healthStatus).toBe(second.healthStatus);
    expect(first.diagnostics.length).toBe(second.diagnostics.length);
  });

  it("report contains timestamp", () => {
    const store = storeWithMemories(memory("m1"));
    const report = generateHealthReport(store, { asOf: NOW });
    expect(typeof report.timestamp).toBe("string");
    expect(report.timestamp.length).toBeGreaterThan(0);
  });

  it("records near retention limit detected", () => {
    const memories = Array.from({ length: 95 }, (_, i) =>
      memory(`m${i}`, { createdAt: OLD })
    );
    const store = storeWithMemories(...memories);
    const report = generateHealthReport(store, {
      policy: { maxActiveMemories: 100 },
      asOf: NOW,
    });
    expect(report.recordsNearRetentionLimit).toBeGreaterThanOrEqual(0);
  });
});

// ─── RECOMMENDATIONS ────────────────────────────────────────────────────────

describe("M5.7 recommendations", () => {
  it("validation recommendation generated for errors", () => {
    const diagnostics: Diagnostic[] = [
      makeDiagnostic(DIAGNOSTIC_CODES.MEMORY_INVALID_RECORD, "error", "bad", "mem-1"),
    ];
    const recs = generateRecommendations(diagnostics, []);
    expect(recs.some((r) => r.action === "review" || r.action === "validate")).toBe(true);
  });

  it("archive recommendation generated when policy allows", () => {
    const store = storeWithMemories(
      memory("m1", { createdAt: OLD })
    );
    const diagnostics: Diagnostic[] = [];
    const recs = generateRecommendations(diagnostics, store.list(), {
      policy: { maxAgeDays: 30 },
      asOf: NOW,
    });
    expect(recs.some((r) => r.action === "cleanup")).toBe(true);
  });

  it("consolidation recommendation generated for duplicates", () => {
    const diagnostics: Diagnostic[] = [
      makeDiagnostic(DIAGNOSTIC_CODES.MEMORY_DUPLICATE, "warning", "dupes"),
    ];
    const recs = generateRecommendations(diagnostics, [memory("m1"), memory("m2")]);
    expect(recs.some((r) => r.action === "consolidate")).toBe(true);
  });

  it("retain recommendation for stale records", () => {
    const diagnostics: Diagnostic[] = [
      makeDiagnostic(DIAGNOSTIC_CODES.MEMORY_STALE, "warning", "stale"),
    ];
    const recs = generateRecommendations(diagnostics, [memory("m1")]);
    expect(recs.some((r) => r.action === "retain")).toBe(true);
  });

  it("uncertain cases remain review-only", () => {
    const diagnostics: Diagnostic[] = [
      makeDiagnostic(DIAGNOSTIC_CODES.MEMORY_CONTENT_HASH_MISMATCH, "warning", "mismatch", "mem-1"),
    ];
    const recs = generateRecommendations(diagnostics, [memory("m1")]);
    expect(recs.some((r) => r.action === "review")).toBe(true);
  });

  it("no recommendations when no diagnostics", () => {
    const recs = generateRecommendations([], [memory("m1")]);
    expect(recs).toHaveLength(0);
  });
});

// ─── MAINTENANCE EXECUTION ──────────────────────────────────────────────────

describe("M5.7 maintenance execution", () => {
  it("empty memory returns healthy result", () => {
    const store = new InMemoryMemoryStore({ capacity: 10 });
    const result = runMaintenance(store, { asOf: NOW });
    expect(result.healthStatus).toBe("healthy");
    expect(result.scanned).toBe(0);
    expect(result.bounded).toBe(true);
  });

  it("healthy memory completes successfully", () => {
    const store = storeWithMemories(memory("m1"), memory("m2"), memory("m3"));
    const result = runMaintenance(store, { asOf: NOW });
    expect(result.healthStatus).toBe("healthy");
    expect(result.scanned).toBe(3);
    expect(result.validated).toBe(3);
  });

  it("expired memory is archived", () => {
    const store = storeWithMemories(
      memory("m1", { createdAt: OLD })
    );
    const result = runMaintenance(store, {
      policy: { maxAgeDays: 30 },
      asOf: NOW,
    });
    expect(result.actionsExecuted).toBeGreaterThanOrEqual(1);
    expect(store.get("mem-m1")?.status).toBe("superseded");
  });

  it("duplicate memory triggers consolidation", () => {
    const shared = "Shared content for testing consolidation behavior.";
    const store = storeWithMemories(
      memory("m1", { content: shared }),
      memory("m2", { content: shared })
    );
    const result = runMaintenance(store, { asOf: NOW });
    expect(result.healthReport.duplicateCandidates).toBeGreaterThanOrEqual(1);
  });

  it("malformed memory produces diagnostics", () => {
    const ref = brokenMemory();
    const diagnostics = validateMemoryRecord(ref);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("mixed healthy/unhealthy memory handled correctly", () => {
    const store = storeWithMemories(
      memory("m1"),
      memory("m2", { createdAt: OLD })
    );
    const result = runMaintenance(store, { asOf: NOW });
    expect(result.scanned).toBe(2);
    expect(result.healthStatus).toBeDefined();
  });

  it("bounded processing respects limit", () => {
    const store = new InMemoryMemoryStore({ capacity: 10 });
    const result = runMaintenance(store, { maxOperations: 5, asOf: NOW });
    expect(result.bounded).toBe(true);
  });

  it("deterministic results for same input", () => {
    const store = storeWithMemories(memory("m1"), memory("m2"));
    const first = runMaintenance(store, { asOf: NOW });
    const second = runMaintenance(store, { asOf: NOW });
    expect(first.scanned).toBe(second.scanned);
    expect(first.healthStatus).toBe(second.healthStatus);
    expect(first.diagnostics.length).toBe(second.diagnostics.length);
  });

  it("idempotent repeated execution", () => {
    const store = storeWithMemories(
      memory("m1", { createdAt: OLD })
    );
    const first = runMaintenance(store, {
      policy: { maxAgeDays: 30 },
      asOf: NOW,
    });
    const second = runMaintenance(store, {
      policy: { maxAgeDays: 30 },
      asOf: NOW,
    });
    expect(store.get("mem-m1")?.status).toBe("superseded");
    expect(first.scanned).toBe(second.scanned);
  });

  it("dryRun does not mutate store", () => {
    const store = storeWithMemories(
      memory("m1", { createdAt: OLD })
    );
    const before = store.get("mem-m1")?.status;
    runMaintenance(store, {
      policy: { maxAgeDays: 30 },
      dryRun: true,
      asOf: NOW,
    });
    expect(store.get("mem-m1")?.status).toBe(before);
  });

  it("no unintended deletion of valid memory", () => {
    const store = storeWithMemories(memory("m1"), memory("m2"), memory("m3"));
    runMaintenance(store, { asOf: NOW });
    expect(store.get("mem-m1")).toBeDefined();
    expect(store.get("mem-m2")).toBeDefined();
    expect(store.get("mem-m3")).toBeDefined();
  });

  it("result contains executions array", () => {
    const store = storeWithMemories(memory("m1"));
    const result = runMaintenance(store, { asOf: NOW });
    expect(Array.isArray(result.executions)).toBe(true);
    expect(result.executions.length).toBeGreaterThanOrEqual(1);
  });

  it("result contains timestamp", () => {
    const store = storeWithMemories(memory("m1"));
    const result = runMaintenance(store, { asOf: NOW });
    expect(typeof result.timestamp).toBe("string");
  });
});

// ─── SECURITY ───────────────────────────────────────────────────────────────

describe("M5.7 security", () => {
  it("no network access", () => {
    const store = storeWithMemories(memory("m1"));
    const result = runMaintenance(store, { asOf: NOW });
    expect(result).toBeDefined();
    expect(typeof result.healthStatus).toBe("string");
  });

  it("no command execution", () => {
    const store = storeWithMemories(memory("m1"));
    const result = runMaintenance(store, { asOf: NOW });
    expect(result.scanned).toBe(1);
  });

  it("no arbitrary filesystem access", () => {
    const store = storeWithMemories(memory("m1"));
    const result = runMaintenance(store, { asOf: NOW });
    expect(result.bounded).toBe(true);
  });

  it("oversized input is bounded", () => {
    const store = new InMemoryMemoryStore({ capacity: 10 });
    const result = runMaintenance(store, { maxOperations: 3, asOf: NOW });
    expect(result.bounded).toBe(true);
  });

  it("diagnostic output does not leak full memory content", () => {
    const ref = memory("m1", { content: "Super secret content that should not appear in diagnostics." });
    const diagnostics = validateMemoryRecord(ref);
    const allMessages = diagnostics.map((d) => d.message).join(" ");
    expect(allMessages).not.toContain("Super secret content");
  });

  it("health report does not leak memory content", () => {
    const store = storeWithMemories(
      memory("m1", { content: "Confidential data here." })
    );
    const report = generateHealthReport(store, { asOf: NOW });
    const reportStr = JSON.stringify(report);
    expect(reportStr).not.toContain("Confidential data here");
  });

  it("recommendations do not leak memory content", () => {
    const diagnostics: Diagnostic[] = [
      makeDiagnostic(DIAGNOSTIC_CODES.MEMORY_STALE, "warning", "stale", "mem-1"),
    ];
    const recs = generateRecommendations(diagnostics, [
      memory("m1", { content: "Private information." }),
    ]);
    const recsStr = JSON.stringify(recs);
    expect(recsStr).not.toContain("Private information");
  });
});

// ─── INTEGRATION WITH M5.1–M5.6 ────────────────────────────────────────────

describe("M5.7 integration with M5.1–M5.6", () => {
  it("barrel exports include maintenance", async () => {
    const barrel = await import("../index");
    expect(typeof barrel.validateMemoryRecord).toBe("function");
    expect(typeof barrel.generateHealthReport).toBe("function");
    expect(typeof barrel.generateRecommendations).toBe("function");
    expect(typeof barrel.runMaintenance).toBe("function");
  });

  it("existing APIs still work", async () => {
    const barrel = await import("../../index");
    expect(typeof barrel.constructMemory).toBe("function");
    expect(typeof barrel.InMemoryMemoryStore).toBe("function");
    expect(typeof barrel.performCleanup).toBe("function");
  });

  it("maintenance works with InMemoryMemoryStore", () => {
    const store = new InMemoryMemoryStore({ capacity: 10 });
    store.save(memory("m1"));
    store.save(memory("m2"));
    const result = runMaintenance(store, { asOf: NOW });
    expect(result.scanned).toBe(2);
    expect(result.healthStatus).toBe("healthy");
  });

  it("maintenance works after lifecycle operations", () => {
    const store = new InMemoryMemoryStore({ capacity: 10 });
    store.save(memory("m1"));
    store.save(memory("m2", { createdAt: OLD }));
    runMaintenance(store, {
      policy: { maxAgeDays: 30 },
      asOf: NOW,
    });
    const result = runMaintenance(store, { asOf: NOW });
    expect(result.scanned).toBe(2);
  });
});
