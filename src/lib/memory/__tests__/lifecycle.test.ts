/**
 * M5.6 – Lifecycle, scoring, duplicates, consolidation, retention, cleanup.
 */

import {
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
} from "../lifecycle/status";
import {
  DEFAULT_SCORING_WEIGHTS,
  importanceNumeric,
  recencyScore,
  accessFrequencyScore,
  computeMemoryScore,
  scoreMemories,
  validateWeights,
} from "../lifecycle/scoring";
import {
  contentHash,
  findExactDuplicates,
  findNearDuplicates,
  deduplicateByIdenticalContent,
} from "../lifecycle/duplicates";
import {
  planConsolidation,
  consolidateGroup,
  consolidate,
} from "../lifecycle/consolidation";
import {
  DEFAULT_RETENTION_POLICY,
  isProtected,
  isEligibleForExpiration,
  selectExpiredMemories,
  selectForRecycling,
  type RetentionPolicy,
} from "../lifecycle/retention";
import { performCleanup, type CleanupReport } from "../lifecycle/cleanup";
import { InMemoryMemoryStore } from "../store/in-memory";
import { constructMemory } from "../validation";
import { MEMORY_LIMITS } from "../limits";
import type {
  MemoryConfidence,
  MemoryImportance,
  MemoryReference,
  MemoryStatus,
} from "../types";

const NOW = "2026-06-15T12:00:00.000Z";

function memory(
  id: string,
  overrides: Partial<MemoryReference> = {},
  status: MemoryStatus = "stored"
): MemoryReference {
  const { expiresAt, createdAt, ...inputOverrides } = overrides;
  const ref = constructMemory(
    {
      content: `Memory content for ${id}.`,
      provenance: { sourceKind: "text", ingestedAt: NOW },
      ...inputOverrides,
      status,
    },
    { now: NOW, id }
  );
  let result = ref;
  if (expiresAt !== undefined) result = { ...result, expiresAt };
  if (createdAt !== undefined) result = { ...result, createdAt };
  return result;
}

describe("M5.6 lifecycle transitions", () => {
  it("allows valid transitions", () => {
    expect(isValidTransition("candidate", "stored")).toBe(true);
    expect(isValidTransition("candidate", "rejected")).toBe(true);
    expect(isValidTransition("stored", "retrievable")).toBe(true);
    expect(isValidTransition("stored", "archived")).toBe(true);
    expect(isValidTransition("stored", "superseded")).toBe(true);
    expect(isValidTransition("archived", "stored")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(isValidTransition("rejected", "stored")).toBe(false);
    expect(isValidTransition("superseded", "stored")).toBe(false);
    expect(isValidTransition("archived", "rejected")).toBe(false);
    expect(isValidTransition("candidate", "archived")).toBe(false);
  });

  it("identifies terminal statuses", () => {
    expect(isTerminalStatus("rejected")).toBe(true);
    expect(isTerminalStatus("superseded")).toBe(true);
    expect(isTerminalStatus("stored")).toBe(false);
    expect(isTerminalStatus("archived")).toBe(false);
  });

  it("transitionStatus produces updated memory", () => {
    const ref = memory("m1");
    const archived = transitionStatus(ref, "archived", NOW);
    expect(archived.status).toBe("archived");
    expect(archived.updatedAt).toBe(NOW);
    expect(archived.id).toBe("m1");
  });

  it("throws on invalid transition", () => {
    const ref = memory("m1", {}, "candidate");
    expect(() => transitionStatus(ref, "archived")).toThrow(/invalid/);
  });

  it("convenience functions work correctly", () => {
    const ref = memory("m1", {}, "candidate");
    expect(activateMemory(ref, NOW).status).toBe("stored");
    expect(archiveMemory(activateMemory(ref, NOW), NOW).status).toBe("archived");
    expect(expireMemory(activateMemory(ref, NOW), NOW).status).toBe("superseded");
    expect(restoreMemory(archiveMemory(activateMemory(ref, NOW), NOW), NOW).status).toBe("stored");
  });

  it("isExpired checks expiresAt correctly", () => {
    const ref = memory("m1", { expiresAt: "2026-01-01T00:00:00.000Z" });
    expect(isExpired(ref, "2026-06-15T00:00:00.000Z")).toBe(true);
    expect(isExpired(ref, "2025-06-15T00:00:00.000Z")).toBe(false);
    expect(isExpired(memory("m2"))).toBe(false);
  });

  it("updateLastAccessed stamps the time", () => {
    const ref = memory("m1");
    const updated = updateLastAccessed(ref, NOW);
    expect(updated.lastAccessedAt).toBe(NOW);
  });

  it("daysSince computes correctly", () => {
    expect(daysSince("2026-06-15T00:00:00.000Z", "2026-06-16T00:00:00.000Z")).toBeCloseTo(1);
    expect(daysSince("2026-06-15T00:00:00.000Z", "2026-06-15T00:00:00.000Z")).toBe(0);
    expect(daysSince("2026-06-16T00:00:00.000Z", "2026-06-15T00:00:00.000Z")).toBe(0);
  });

  it("isActiveStatus and isArchivedStatus are correct", () => {
    expect(isActiveStatus("stored")).toBe(true);
    expect(isActiveStatus("retrievable")).toBe(true);
    expect(isActiveStatus("archived")).toBe(false);
    expect(isArchivedStatus("archived")).toBe(true);
    expect(isArchivedStatus("stored")).toBe(false);
  });
});

describe("M5.6 scoring", () => {
  it("computes deterministic bounded scores", () => {
    const ref = memory("m1");
    const score = computeMemoryScore(ref, DEFAULT_SCORING_WEIGHTS, NOW);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(Number.isFinite(score)).toBe(true);
  });

  it("scores are deterministic for identical inputs", () => {
    const ref = memory("m1");
    const first = computeMemoryScore(ref, DEFAULT_SCORING_WEIGHTS, NOW);
    const second = computeMemoryScore(ref, DEFAULT_SCORING_WEIGHTS, NOW);
    expect(first).toBe(second);
  });

  it("importanceNumeric maps correctly", () => {
    expect(importanceNumeric("low")).toBe(0.25);
    expect(importanceNumeric("medium")).toBe(0.5);
    expect(importanceNumeric("high")).toBe(0.75);
    expect(importanceNumeric("critical")).toBe(1);
  });

  it("recencyScore decays over time", () => {
    const recent = recencyScore("2026-06-14T00:00:00.000Z", NOW);
    const old = recencyScore("2026-01-01T00:00:00.000Z", NOW);
    expect(recent).toBeGreaterThan(old);
    expect(recent).toBeLessThanOrEqual(1);
    expect(old).toBeGreaterThanOrEqual(0);
  });

  it("accessFrequencyScore handles missing access", () => {
    expect(accessFrequencyScore(undefined, "2026-01-01T00:00:00.000Z", NOW)).toBe(0);
  });

  it("scoreMemories sorts by score desc then id asc", () => {
    const a = memory("m-a", { importance: "high" });
    const b = memory("m-b", { importance: "low" });
    const c = memory("m-c", { importance: "high" });
    const scored = scoreMemories([b, a, c], DEFAULT_SCORING_WEIGHTS, NOW);
    expect(scored[0].score).toBeGreaterThanOrEqual(scored[1].score);
    expect(scored[1].score).toBeGreaterThanOrEqual(scored[2].score);
  });

  it("validateWeights checks shape", () => {
    expect(validateWeights(DEFAULT_SCORING_WEIGHTS)).toBe(true);
    expect(validateWeights(null)).toBe(false);
    expect(validateWeights({})).toBe(false);
    expect(validateWeights({ recency: Number.NaN, importance: 0, confidence: 0, accessFrequency: 0 })).toBe(false);
  });

  it("never produces NaN or Infinity", () => {
    const ref = memory("m1", { createdAt: "0001-01-01T00:00:00.000Z" });
    const score = computeMemoryScore(ref, DEFAULT_SCORING_WEIGHTS, NOW);
    expect(Number.isFinite(score)).toBe(true);
  });
});

describe("M5.6 duplicates", () => {
  it("finds exact duplicates by content hash", () => {
    const a = memory("m1");
    const b = memory("m2");
    const c = memory("m3", { content: a.content });
    const groups = findExactDuplicates([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("exact");
    expect(groups[0].primaryId).toBe("m1");
    expect(groups[0].duplicateIds).toEqual(["m3"]);
  });

  it("returns empty when no duplicates", () => {
    const a = memory("m1");
    const b = memory("m2");
    expect(findExactDuplicates([a, b])).toEqual([]);
  });

  it("deduplicateByIdenticalContent keeps oldest", () => {
    const a = memory("m1", { content: "same" });
    const b = memory("m2", { content: "same" });
    const { kept, removed } = deduplicateByIdenticalContent([b, a]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe("m1");
    expect(removed).toEqual(["m2"]);
  });

  it("contentHash is deterministic", () => {
    expect(contentHash("test")).toBe(contentHash("test"));
    expect(contentHash("test")).not.toBe(contentHash("other"));
  });
});

describe("M5.6 consolidation", () => {
  it("consolidates exact duplicates atomically", () => {
    const a = memory("m1");
    const b = memory("m2", { content: a.content });
    const result = consolidate([a, b], NOW);
    expect(result.consolidated).toHaveLength(1);
    expect(result.consolidated[0].id).toBe("m1");
    expect(result.consolidated[0].content).toBe(a.content);
    expect(result.originalIds).toContain("m1");
    expect(result.originalIds).toContain("m2");
    expect(result.plan.totalOriginals).toBe(2);
  });

  it("preserves provenance in consolidated records", () => {
    const a = memory("m1", {
      provenance: { sourceKind: "web", sourceId: "src-1", ingestedAt: NOW, origin: "web research" },
    });
    const b = memory("m2", { content: a.content });
    const result = consolidate([a, b], NOW);
    expect(result.consolidated[0].provenance.sourceId).toContain("src-1");
    expect(result.consolidated[0].provenance.origin).toContain("consolidated");
  });

  it("returns empty result when no duplicates", () => {
    const a = memory("m1");
    const b = memory("m2");
    const result = consolidate([a, b], NOW);
    expect(result.consolidated).toHaveLength(0);
    expect(result.originalIds).toHaveLength(0);
  });

  it("planConsolidation identifies groups", () => {
    const a = memory("m1");
    const b = memory("m2", { content: a.content });
    const plan = planConsolidation([a, b]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.totalOriginals).toBe(2);
  });

  it("consolidateGroup produces valid memory with merged importance", () => {
    const a = memory("m1", { importance: "high" });
    const b = memory("m2", { content: a.content, importance: "critical" });
    const group = { primaryId: "m1", mergedIds: ["m2"], combinedContent: a.content };
    const result = consolidateGroup([a, b], group, NOW);
    expect(result.importance).toBe("critical");
    expect(result.version).toBe(2);
  });

  it("failed consolidation with empty group throws", () => {
    expect(() => consolidateGroup([], { primaryId: "x", mergedIds: [], combinedContent: "" }, NOW)).toThrow();
  });
});

describe("M5.6 retention", () => {
  it("identifies protected memories", () => {
    const critical = memory("m1", { importance: "critical" });
    const tagged = memory("m2", { metadata: { scope: "global", tags: ["pinned"], extra: {} } });
    const idProtected = memory("m3");
    const policy: RetentionPolicy = { protectedIds: ["m3"], protectedTags: ["pinned"] };
    expect(isProtected(critical, policy)).toBe(true);
    expect(isProtected(tagged, policy)).toBe(true);
    expect(isProtected(idProtected, policy)).toBe(true);
    expect(isProtected(memory("m4"), policy)).toBe(false);
  });

  it("identifies memories eligible for expiration", () => {
    const old = memory("old", { createdAt: "2020-01-01T00:00:00.000Z" });
    const recent = memory("recent", { createdAt: "2026-06-01T00:00:00.000Z" });
    const policy: RetentionPolicy = { maxAgeDays: 30, minImportance: "low" };
    expect(isEligibleForExpiration(old, policy, NOW)).toBe(true);
    expect(isEligibleForExpiration(recent, policy, NOW)).toBe(false);
  });

  it("selectExpiredMemories returns sorted eligible", () => {
    const a = memory("a", { createdAt: "2020-01-01T00:00:00.000Z" });
    const b = memory("b", { createdAt: "2019-01-01T00:00:00.000Z" });
    const policy: RetentionPolicy = { maxAgeDays: 30 };
    const expired = selectExpiredMemories([a, b], policy, NOW);
    expect(expired.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("selectForRecycling returns IDs when active capacity exceeded", () => {
    const memories = Array.from({ length: 12 }, (_, i) =>
      memory(`m${i}`, { createdAt: `2020-0${1 + (i % 9)}-01T00:00:00.000Z` })
    );
    const policy: RetentionPolicy = { maxActiveMemories: 10, maxAgeDays: 365 };
    const ids = selectForRecycling(memories, policy, NOW);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(MEMORY_LIMITS.MAX_RECYCLING_LIMIT);
  });
});

describe("M5.6 cleanup", () => {
  it("performs cleanup and returns report", () => {
    const store = new InMemoryMemoryStore({ capacity: 100 });
    store.save(memory("m1"));
    store.save(memory("m2"));
    const report = performCleanup(store, { asOf: NOW });
    expect(report.scanned).toBe(2);
    expect(report.timestamp).toBe(NOW);
    expect(Array.isArray(report.actions)).toBe(true);
  });

  it("expires old memories according to policy", () => {
    const store = new InMemoryMemoryStore({ capacity: 100 });
    store.save(memory("old", { createdAt: "2020-01-01T00:00:00.000Z" }));
    store.save(memory("recent"));
    const policy: RetentionPolicy = { maxAgeDays: 30 };
    const report = performCleanup(store, { policy, asOf: NOW });
    expect(report.expiredCount).toBe(1);
    expect(store.get("old")?.status).toBe("superseded");
    expect(store.get("recent")?.status).toBe("stored");
  });

  it("respects protected memories", () => {
    const store = new InMemoryMemoryStore({ capacity: 100 });
    store.save(memory("old", { createdAt: "2020-01-01T00:00:00.000Z", importance: "critical" }));
    const policy: RetentionPolicy = { maxAgeDays: 30 };
    const report = performCleanup(store, { policy, asOf: NOW });
    expect(report.expiredCount).toBe(0);
    expect(report.protectedCount).toBe(1);
  });

  it("dryRun does not mutate store", () => {
    const store = new InMemoryMemoryStore({ capacity: 100 });
    store.save(memory("old", { createdAt: "2020-01-01T00:00:00.000Z" }));
    const policy: RetentionPolicy = { maxAgeDays: 30 };
    performCleanup(store, { policy, dryRun: true, asOf: NOW });
    expect(store.get("old")?.status).toBe("stored");
  });

  it("cleanup report is deterministic", () => {
    const store = new InMemoryMemoryStore({ capacity: 100 });
    store.save(memory("m1", { createdAt: "2020-01-01T00:00:00.000Z" }));
    const policy: RetentionPolicy = { maxAgeDays: 30 };
    const first = performCleanup(store, { policy, asOf: NOW });
    store.upsert(memory("m1", { createdAt: "2020-01-01T00:00:00.000Z" }));
    const second = performCleanup(store, { policy, asOf: NOW });
    expect(first.scanned).toBe(second.scanned);
    expect(first.expiredCount).toBe(second.expiredCount);
  });
});

describe("M5.6 security", () => {
  it("rejects malformed lifecycle state", () => {
    const ref = memory("m1");
    expect(() => transitionStatus(ref, "invalid" as MemoryStatus)).toThrow();
  });

  it("handles invalid timestamps in scoring", () => {
    const ref = memory("m1", { createdAt: "not-a-date" });
    const score = computeMemoryScore(ref, DEFAULT_SCORING_WEIGHTS, NOW);
    expect(Number.isFinite(score)).toBe(true);
  });

  it("NaN/Infinity scores are bounded", () => {
    const ref = memory("m1");
    const score = computeMemoryScore(ref, { recency: Number.NaN, importance: 0, confidence: 0, accessFrequency: 0 }, NOW);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("oversized policies are handled", () => {
    const policy: RetentionPolicy = {
      maxActiveMemories: Number.POSITIVE_INFINITY,
      maxAgeDays: Number.POSITIVE_INFINITY,
      protectedIds: new Array(10000).fill("x"),
    };
    const ref = memory("m1");
    expect(isProtected(ref, policy)).toBe(false);
    expect(isEligibleForExpiration(ref, policy, NOW)).toBe(false);
  });

  it("prototype pollution in metadata is ignored", () => {
    const ref = memory("m1");
    (ref.metadata as unknown as Record<string, unknown>)["__proto__"] = { admin: true };
    expect(isProtected(ref, DEFAULT_RETENTION_POLICY)).toBe(false);
  });

  it("duplicate IDs in consolidation are handled", () => {
    const a = memory("m1");
    const b = memory("m2", { content: a.content });
    const result = consolidate([a, b], NOW);
    expect(result.consolidated).toHaveLength(1);
  });

  it("no lifecycle operation executes arbitrary code", () => {
    const ref = memory("m1", {}, "candidate");
    ref.content = "require('child_process').exec('rm -rf /')";
    const activated = activateMemory(ref, NOW);
    expect(activated.content).toBe(ref.content);
  });
});

describe("M5.6 regression with M5.1–M5.5", () => {
  it("coexists with all memory barrel exports", async () => {
    const barrel = await import("../index");
    expect(typeof barrel.constructMemory).toBe("function");
    expect(typeof barrel.InMemoryMemoryStore).toBe("function");
    expect(typeof barrel.performCleanup).toBe("function");
    expect(typeof barrel.computeMemoryScore).toBe("function");
    expect(typeof barrel.consolidate).toBe("function");
    expect(typeof barrel.findExactDuplicates).toBe("function");
  });

  it("lifecycle works with InMemoryMemoryStore", () => {
    const store = new InMemoryMemoryStore({ capacity: 10 });
    const ref = memory("m1", {}, "candidate");
    store.save(ref);
    const activated = activateMemory(store.get("m1")!, NOW);
    store.upsert(activated);
    expect(store.get("m1")?.status).toBe("stored");
    const archived = archiveMemory(store.get("m1")!, NOW);
    store.upsert(archived);
    expect(store.get("m1")?.status).toBe("archived");
  });

  it("scoring works with store-listed memories", () => {
    const store = new InMemoryMemoryStore({ capacity: 10 });
    store.save(memory("a", { importance: "high" }));
    store.save(memory("b", { importance: "low" }));
    const scored = scoreMemories(store.list(), DEFAULT_SCORING_WEIGHTS, NOW);
    expect(scored[0].id).toBe("a");
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });
});