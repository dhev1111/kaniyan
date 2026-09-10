/**
 * M5.3 – Embedding abstractions: validation, provider contract and the
 * deterministic offline provider.
 */

import {
  DeterministicEmbeddingProvider,
  EmbeddingValidationError,
  assertEmbeddingDimension,
  assertEmbeddingRequest,
  assertEmbeddingVector,
  validateEmbeddingRequest,
  validateEmbeddingVector,
  clampEmbeddingBatch,
  maxEmbeddingDimensions,
  maxEmbeddingBatchSize,
  type EmbeddingProvider,
  type EmbeddingRequest,
} from "../embedding";

describe("M5.3 embedding validation", () => {
  it("accepts valid finite vectors", () => {
    const report = validateEmbeddingVector([0.5, -1, 0, 2.75]);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("rejects empty vectors", () => {
    const report = validateEmbeddingVector([]);
    expect(report.ok).toBe(false);
    expect(report.issues[0].path).toBe("vector");
    expect(() => assertEmbeddingVector([])).toThrow(EmbeddingValidationError);
  });

  it("rejects NaN", () => {
    const report = validateEmbeddingVector([0, Number.NaN, 1]);
    expect(report.ok).toBe(false);
    expect(report.issues.some((entry) => entry.path === "vector[1]")).toBe(true);
  });

  it("rejects +Infinity and -Infinity", () => {
    for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const report = validateEmbeddingVector([value, 1]);
      expect(report.ok).toBe(false);
    }
  });

  it("rejects non-array and non-numeric entries", () => {
    expect(validateEmbeddingVector("nope").ok).toBe(false);
    expect(validateEmbeddingVector([1, "x", 2]).ok).toBe(false);
    expect(validateEmbeddingVector([1, null, 2]).ok).toBe(false);
    expect(validateEmbeddingVector([1, undefined, 2]).ok).toBe(false);
  });

  it("rejects sparse arrays (holes) as malformed input", () => {
    const sparse = new Array<number>(3);
    sparse[0] = 1;
    sparse[2] = 3;
    const report = validateEmbeddingVector(sparse);
    expect(report.ok).toBe(false);
    expect(report.issues.some((entry) => entry.message.includes("hole"))).toBe(true);
  });

  it("binds vector length to the central dimension cap", () => {
    const oversized = new Array<number>(maxEmbeddingDimensions() + 1).fill(1);
    const report = validateEmbeddingVector(oversized);
    expect(report.ok).toBe(false);
  });

  it("validates requests and dimensions defensively", () => {
    expect(validateEmbeddingRequest({ text: "hello" }).ok).toBe(true);
    expect(validateEmbeddingRequest({ text: "   " }).ok).toBe(false);
    expect(() => assertEmbeddingDimension(0)).toThrow(EmbeddingValidationError);
    expect(() => assertEmbeddingDimension(-3)).toThrow(EmbeddingValidationError);
    expect(() => assertEmbeddingDimension(maxEmbeddingDimensions() + 1)).toThrow(
      EmbeddingValidationError
    );
    expect(() => assertEmbeddingRequest({ text: "" })).toThrow(EmbeddingValidationError);
  });

  it("clamps batch sizes to the central bound", () => {
    expect(clampEmbeddingBatch(-5)).toBe(1);
    expect(clampEmbeddingBatch(0.4)).toBe(1);
    expect(clampEmbeddingBatch(3)).toBe(3);
    expect(clampEmbeddingBatch(1_000_000)).toBe(maxEmbeddingBatchSize());
  });
});

describe("M5.3 deterministic embedding provider", () => {
  it("is asynchronous and provider-agnostic by contract", async () => {
    const provider: EmbeddingProvider = new DeterministicEmbeddingProvider(4);
    expect(typeof provider.embed).toBe("function");
    const response = await provider.embed({ text: "vector test" });
    expect(response.vector).toHaveLength(4);
    expect(response.model).toMatch(/^kaniyan\/deterministic\//);
  });

  it("keeps dimension consistent for a provider instance", async () => {
    const provider = new DeterministicEmbeddingProvider(8);
    const vectors = await Promise.all(
      ["alpha", "beta", "gamma"].map((text) => provider.embed({ text }))
    );
    for (const entry of vectors) {
      expect(entry.vector).toHaveLength(8);
      expect(Number.isFinite(entry.vector[0])).toBe(true);
    }
  });

  it("is deterministic for identical input", async () => {
    const provider = new DeterministicEmbeddingProvider(6);
    const first = await provider.embed({ text: "same input" });
    const second = await provider.embed({ text: "same input" });
    expect(first.vector).toEqual(second.vector);
    expect(first.model).toBe(second.model);
  });

  it("never returns NaN or Infinity and copies state out", async () => {
    const provider = new DeterministicEmbeddingProvider(16);
    const response = await provider.embed({ text: "adversarial\u0000input\n\r" });
    for (const entry of response.vector) {
      expect(Number.isFinite(entry)).toBe(true);
    }
    response.vector.push(99);
    const again = await provider.embed({ text: "adversarial\u0000input\n\r" });
    expect(again.vector.length).toBe(16);
  });

  it("embeds batches in deterministic order with bounded size", async () => {
    const provider = new DeterministicEmbeddingProvider(4, { providerId: "test" });
    const many = Array.from({ length: 300 }, (_, index) => ({ text: `item ${index}` }));
    const responses = await provider.embedMany(many);
    expect(responses.length).toBeLessThanOrEqual(maxEmbeddingBatchSize());
    expect(responses.length).toBeGreaterThan(1);
    const rerun = await provider.embedMany(many.slice(0, responses.length));
    expect(rerun).toEqual(responses);
  });

  it("rejects oversized and empty request text", async () => {
    const provider = new DeterministicEmbeddingProvider(4);
    await expect(provider.embed({ text: "" })).rejects.toThrow(EmbeddingValidationError);
    await expect(
      provider.embed({ text: "x".repeat(200_001) })
    ).rejects.toThrow(EmbeddingValidationError);
  });

  it("exposes a stable capability description", () => {
    const provider = new DeterministicEmbeddingProvider(3, { providerId: "offline" });
    const description = provider.describe();
    expect(description.providerId).toBe("offline");
    expect(description.dimensions).toBe(3);
    expect(description.description).toContain("offline");
  });
});