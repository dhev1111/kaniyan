/**
 * M5.1 – Memory architecture: schema/model, validation, serialization,
 * and invalid-input handling.
 */

import { MEMORY_LIMITS } from "../limits";
import { memoryId, fnv1a36, normalizeText, clamp01, round6 } from "../util";
import {
  constructMemory,
  MemoryValidationError,
  validateInput,
  validateQuery,
  isMemoryType,
  isMemoryStatus,
  isMemoryConfidence,
  isMemoryImportance,
  isMemoryScope,
  isAtLeastImportance,
  importanceIndex,
  confidenceScore,
} from "../validation";
import {
  MEMORY_SCHEMA_VERSION,
  serializeDocument,
  serializeMemoryJson,
  parseMemoryJson,
  roundTripMemory,
  SERIALIZATION_MIGRATIONS,
} from "../serialization";
import type {
  MemoryInput,
  MemoryQuery,
  MemoryReference,
  MemoryResult,
} from "../types";

const NOW = "2026-02-01T00:00:00.000Z";

function validInput(overrides: Partial<MemoryInput> = {}): MemoryInput {
  return {
    content:
      "KANIYAN uses a memory subsystem split into working, episodic, semantic, procedural and project memory.",
    provenance: {
      sourceKind: "text",
      origin: "architecture notes",
      ingestedAt: NOW,
    },
    type: "semantic",
    importance: "high",
    confidence: "high",
    ...overrides,
  };
}

describe("M5.1 schema model", () => {
  it("enumerates the five required memory categories", () => {
    expect(isMemoryType("working")).toBe(true);
    expect(isMemoryType("episodic")).toBe(true);
    expect(isMemoryType("semantic")).toBe(true);
    expect(isMemoryType("procedural")).toBe(true);
    expect(isMemoryType("project")).toBe(true);
    expect(isMemoryType("executive")).toBe(false);
  });

  it("covers the memory lifecycle statuses", () => {
    for (const status of [
      "candidate",
      "validated",
      "stored",
      "retrievable",
      "archived",
      "rejected",
      "superseded",
    ]) {
      expect(isMemoryStatus(status)).toBe(true);
    }
    expect(isMemoryStatus("deleted")).toBe(false);
  });

  it("provides confidence, importance and scope enums", () => {
    for (const value of ["low", "medium", "high"]) {
      expect(isMemoryConfidence(value)).toBe(true);
    }
    for (const value of ["low", "medium", "high", "critical"]) {
      expect(isMemoryImportance(value)).toBe(true);
    }
    for (const value of ["global", "project", "task", "session"]) {
      expect(isMemoryScope(value)).toBe(true);
    }
  });

  it("builds a complete, deterministic reference from valid input", () => {
    const first = constructMemory(validInput(), { now: NOW });
    const second = constructMemory(validInput(), { now: NOW });
    expect(first.id.startsWith("mem-")).toBe(true);
    expect(first.id).toBe(second.id);
    expect(first.contentHash).toBe(fnv1a36(first.content));
    expect(first.type).toBe("semantic");
    expect(first.status).toBe("candidate");
    expect(first.importance).toBe("high");
    expect(first.confidence).toBe("high");
    expect(first.version).toBe(1);
    expect(first.createdAt).toBe(NOW);
    expect(first.updatedAt).toBe(NOW);
    expect(first.conflicts).toEqual([]);
    expect(first.relationships).toEqual([]);
  });

  it("applies sensibles defaults when optional fields are omitted", () => {
    const memory = constructMemory(
      { content: "A short fact.", provenance: { sourceKind: "web", ingestedAt: NOW } },
      { now: NOW }
    );
    expect(memory.type).toBe("semantic");
    expect(memory.status).toBe("candidate");
    expect(memory.importance).toBe("medium");
    expect(memory.confidence).toBe("medium");
    expect(memory.metadata.scope).toBe("global");
    expect(memory.metadata.tags).toEqual([]);
    expect(memory.source.id).toMatch(/^mem-/);
  });

  it("tracks version numbers deterministically", () => {
    const base = constructMemory(validInput(), { now: NOW });
    const next = constructMemory(validInput(), { now: NOW, version: 7 });
    expect(base.version).toBe(1);
    expect(next.version).toBe(7);
  });

  it("maps importance and confidence to deterministic numeric scales", () => {
    expect(importanceIndex("low")).toBe(0);
    expect(importanceIndex("critical")).toBe(3);
    expect(isAtLeastImportance("high", "medium")).toBe(true);
    expect(isAtLeastImportance("low", "medium")).toBe(false);
    expect(confidenceScore("high")).toBe(1);
    expect(confidenceScore("medium")).toBe(0.5);
    expect(confidenceScore("low")).toBe(0.25);
  });
});

describe("M5.1 validation", () => {
  it("accepts valid input", () => {
    const report = validateInput(validInput());
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("rejects empty and whitespace-only content", () => {
    for (const content of ["", "   ", "\n\t"]) {
      const report = validateInput(validInput({ content }));
      expect(report.ok).toBe(false);
      expect(report.issues.some((issue) => issue.path === "content")).toBe(true);
    }
  });

  it("rejects unknown enum values with bounded messages", () => {
    const type = validateInput(validInput({ type: "executive" as never }));
    expect(type.ok).toBe(false);
    expect(type.issues.some((issue) => issue.path === "type")).toBe(true);

    const status = validateInput(validInput({ status: "deleted" as never }));
    expect(status.ok).toBe(false);
    expect(status.issues.some((issue) => issue.path === "status")).toBe(true);
  });

  it("requires provenance", () => {
    const report = validateInput(validInput({ provenance: undefined as never }));
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.path === "provenance")).toBe(true);
  });

  it("requires project/task/session ids for scoped memory", () => {
    const projectMissing = validateInput(
      validInput({ metadata: { scope: "project", tags: [], extra: {} } })
    );
    expect(projectMissing.ok).toBe(false);

    const taskMissing = validateInput(
      validInput({ metadata: { scope: "task", tags: [], extra: {} } })
    );
    expect(taskMissing.ok).toBe(false);

    const sessionMissing = validateInput(
      validInput({ metadata: { scope: "session", tags: [], extra: {} } })
    );
    expect(sessionMissing.ok).toBe(false);
  });

  it("rejects invalid urls in source and provenance", () => {
    const source = validateInput(
      validInput({ source: { id: "s1", kind: "web", url: "ftp://example.com" } })
    );
    expect(source.ok).toBe(false);
    expect(source.issues.some((issue) => issue.path === "source.url")).toBe(true);

    const provenance = validateInput(
      validInput({
        provenance: { sourceKind: "web", sourceUrl: "not-a-url", ingestedAt: NOW },
      })
    );
    expect(provenance.ok).toBe(false);
  });

  it("validates query shape", () => {
    const good: MemoryQuery = { text: "vector search", limit: 5, tags: ["rag"] };
    expect(validateQuery(good).ok).toBe(true);

    const badLimit = validateQuery({ limit: 1_000_000 });
    expect(badLimit.ok).toBe(false);

    const badEnum = validateQuery({ memoryTypes: ["executive" as never] });
    expect(badEnum.ok).toBe(false);

    const badDate = validateQuery({ notAfter: "yesterday" });
    expect(badDate.ok).toBe(false);
  });

  it("constructMemory throws a typed error with the issue list", () => {
    try {
      constructMemory(validInput({ content: "" }), { now: NOW });
      throw new Error("expected a validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(MemoryValidationError);
      const validationError = error as MemoryValidationError;
      expect(validationError.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("M5.1 serialization", () => {
  it("produces a schema-versioned canonical document", () => {
    const memory = constructMemory(validInput(), { now: NOW });
    const document = serializeDocument(memory);
    expect(document.schema).toBe(MEMORY_SCHEMA_VERSION);
    expect(document.schema).toBe("kaniyan/memory@1");
    expect(document.memory.id).toBe(memory.id);
  });

  it("round-trips a full reference without loss", () => {
    const memory = constructMemory(
      validInput({
        metadata: {
          scope: "project",
          projectId: "proj-1",
          tags: ["rag", "memory"],
          extra: { team: "core" },
        },
        source: { id: "src-1", kind: "web", title: "docs", url: "https://example.com/m" },
        relationships: [{ targetId: "mem-other", kind: "derived_from", strength: 0.8 }],
      }),
      { now: NOW }
    );
    const restored = roundTripMemory(memory);
    expect(restored).toEqual(memory);
    expect(restored.metadata.tags).toEqual(["rag", "memory"]);
    expect(restored.relationships[0].kind).toBe("derived_from");
  });

  it("produces identical bytes for equal inputs (determinism)", () => {
    const first = serializeMemoryJson(constructMemory(validInput(), { now: NOW }));
    const second = serializeMemoryJson(constructMemory(validInput(), { now: NOW }));
    expect(first).toBe(second);
  });

  it("persists archival and conflict state through a JSON round trip", () => {
    const memory = constructMemory(validInput(), { now: NOW });
    const archived: MemoryReference = {
      ...memory,
      status: "archived",
      lastAccessedAt: NOW,
      conflicts: [
        {
          conflictId: "conf-1",
          involvedMemoryIds: [memory.id, "mem-other"],
          state: "unresolved",
          detectedAt: NOW,
        },
      ],
    };
    const restored = roundTripMemory(archived);
    expect(restored.status).toBe("archived");
    expect(restored.lastAccessedAt).toBe(NOW);
    expect(restored.conflicts[0].state).toBe("unresolved");
  });
});

describe("M5.1 invalid input handling", () => {
  it("reports malformed content types instead of crashing", () => {
    const report = validateInput({ content: 42 as never, provenance: undefined as never });
    expect(report.ok).toBe(false);
    expect(Array.isArray(report.issues)).toBe(true);
  });

  it("rejects oversized content deterministically", () => {
    const oversized = "x".repeat(MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS + 1);
    const report = validateInput(validInput({ content: oversized }));
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.path === "content")).toBe(true);
  });

  it("rejects too many tags and malformed tags", () => {
    const tooMany = Array.from(
      { length: MEMORY_LIMITS.MAX_TAGS_PER_MEMORY + 1 },
      (_, index) => `tag-${index}`
    );
    const count = validateInput(
      validInput({ metadata: { scope: "global", tags: tooMany, extra: {} } })
    );
    expect(count.ok).toBe(false);

    const malformed = validateInput(
      validInput({ metadata: { scope: "global", tags: ["ok", ""], extra: {} } })
    );
    expect(malformed.ok).toBe(false);
  });

  it("rejects invalid relationship targets and strengths", () => {
    const badTarget = validateInput(
      validInput({ relationships: [{ targetId: "not-a-memory", kind: "related" }] })
    );
    expect(badTarget.ok).toBe(false);

    const badStrength = validateInput(
      validInput({ relationships: [{ targetId: "mem-x", kind: "related", strength: 1.5 }] })
    );
    expect(badStrength.ok).toBe(false);
  });

  it("rejects unknown schemas and non-object payloads", () => {
    expect(() => parseMemoryJson("null")).toThrow(/object|JSON/);
    expect(() => parseMemoryJson('[1,2,3]')).toThrow(/object/);
    expect(() => parseMemoryJson('{"schema":"kaniyan/memory@9"}')).toThrow(
      /unsupported memory schema/
    );
    expect(() => parseMemoryJson("not json")).toThrow(/not valid JSON/);
  });

  it("remains empty while no serialization migrations are registered", () => {
    expect(SERIALIZATION_MIGRATIONS).toEqual([]);
  });

  it("keeps numeric helpers bounded and deterministic", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(round6(0.123456789)).toBe(0.123457);
    expect(normalizeText("  hello   world  ")).toBe("hello world");
    expect(memoryId("a", "b")).toBe(`mem-${fnv1a36("a|b")}`);
  });

  it("defines result scoring shapes used by retrieval milestones", () => {
    const memory = constructMemory(validInput(), { now: NOW });
    const result: MemoryResult = {
      memory,
      matchedBy: ["lexical"],
      score: {
        memoryId: memory.id,
        relevance: 1,
        confidence: confidenceScore(memory.confidence),
        freshness: 1,
        importance: 1,
        finalScore: 1,
        reasons: ["exact match"],
      },
    };
    expect(result.matchedBy).toContain("lexical");
    expect(result.score?.finalScore).toBe(1);
  });
});

describe("M5.1 helpers for later milestones", () => {
  it("exposes deterministic id generation for correlations", () => {
    const memory = constructMemory(validInput(), { now: NOW });
    expect(memory.contentHash).toBe(fnv1a36(memory.content));
    expect(memoryId(memory.contentHash)).toMatch(/^mem-[0-9a-z]+$/);
  });
});