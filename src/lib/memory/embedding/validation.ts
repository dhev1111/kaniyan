/**
 * M5.3 – Embedding validation and typed errors.
 * Total, deterministic validation so malformed vectors never reach an index.
 */

import { MEMORY_LIMITS } from "../limits";
import { clamp } from "../util";
import type { EmbeddingRequest, EmbeddingVector } from "./types";

export interface EmbeddingIssue {
  path: string;
  message: string;
}

export interface EmbeddingReport {
  ok: boolean;
  issues: EmbeddingIssue[];
}

export class EmbeddingValidationError extends Error {
  readonly issues: EmbeddingIssue[];
  constructor(issues: EmbeddingIssue[], label = "embedding") {
    super(`${label} validation failed: ${issues.map((entry) => entry.message).join("; ")}`);
    this.name = "EmbeddingValidationError";
    this.issues = issues.slice();
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates a dense vector: a non-empty array (no sparse holes) of finite
 * numbers whose length is within the central dimension bound.
 */
export function validateEmbeddingVector(value: unknown): EmbeddingReport {
  const issues: EmbeddingIssue[] = [];
  if (!Array.isArray(value)) {
    return { ok: false, issues: [{ path: "vector", message: "vector must be an array" }] };
  }
  if (value.length < 1) {
    return { ok: false, issues: [{ path: "vector", message: "vector must not be empty" }] };
  }
  if (value.length > MEMORY_LIMITS.MAX_VECTOR_DIMENSIONS) {
    return {
      ok: false,
      issues: [
        {
          path: "vector",
          message: `vector length exceeds the ${MEMORY_LIMITS.MAX_VECTOR_DIMENSIONS} dimension bound`,
        },
      ],
    };
  }
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (index in value === false) {
      issues.push({ path: `vector[${index}]`, message: "vector contains a hole (sparse array)" });
    } else if (!isFiniteNumber(entry)) {
      issues.push({
        path: `vector[${index}]`,
        message: `vector entry must be a finite number, got ${typeof entry}`,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

export function assertEmbeddingVector(value: unknown, label = "vector"): asserts value is EmbeddingVector {
  const report = validateEmbeddingVector(value);
  if (!report.ok) {
    throw new EmbeddingValidationError(report.issues, label);
  }
}

export function validateEmbeddingRequest(request: unknown): EmbeddingReport {
  const issues: EmbeddingIssue[] = [];
  if (!request || typeof request !== "object") {
    return { ok: false, issues: [{ path: "request", message: "request must be an object" }] };
  }
  const text = (request as EmbeddingRequest).text;
  if (typeof text !== "string" || text.trim() === "") {
    issues.push({ path: "text", message: "text must be a non-empty string" });
  } else if (text.length > MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS) {
    issues.push({
      path: "text",
      message: `text exceeds the ${MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS} char bound`,
    });
  }
  return { ok: issues.length === 0, issues };
}

export function assertEmbeddingRequest(request: unknown): asserts request is EmbeddingRequest {
  const report = validateEmbeddingRequest(request);
  if (!report.ok) {
    throw new EmbeddingValidationError(report.issues, "embedding request");
  }
}

/**
 * Validates a provider dimension: a positive integer at most the central
 * bound. Throws a typed error otherwise.
 */
export function assertEmbeddingDimension(dimensions: number): number {
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new EmbeddingValidationError(
      [{ path: "dimensions", message: "dimensions must be a positive integer" }],
      "embedding dimension"
    );
  }
  if (dimensions > MEMORY_LIMITS.MAX_VECTOR_DIMENSIONS) {
    throw new EmbeddingValidationError(
      [
        {
          path: "dimensions",
          message: `dimensions exceed the ${MEMORY_LIMITS.MAX_VECTOR_DIMENSIONS} bound`,
        },
      ],
      "embedding dimension"
    );
  }
  return dimensions;
}

/** Clamps a requested batch size against the central bound (never below 1). */
export function clampEmbeddingBatch(value: number): number {
  return clamp(Math.floor(value), 1, MEMORY_LIMITS.MAX_EMBEDDING_BATCH);
}