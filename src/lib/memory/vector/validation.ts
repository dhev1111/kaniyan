/**
 * M5.3 – Vector index validation and typed errors.
 * Lives under `vector/` so indexes enforce the central limits policy at the
 * boundary instead of scattering magic numbers.
 */

import { MEMORY_LIMITS } from "../limits";
import { clamp } from "../util";
import {
  EmbeddingValidationError,
  assertEmbeddingVector,
} from "../embedding/validation";
import type { VectorErrorCode, VectorMetadata, VectorRecord } from "./types";

export class VectorValidationError extends Error {
  readonly code: VectorErrorCode;
  readonly issues: string[];
  constructor(code: VectorErrorCode, message: string, issues: string[] = []) {
    super(message);
    this.name = "VectorValidationError";
    this.code = code;
    this.issues = issues.slice();
  }
}

export class VectorIndexCapacityError extends VectorValidationError {
  constructor(capacity: number) {
    super(
      "index-capacity",
      `vector index is full (capacity ${capacity}); remove entries or use upsert on an existing id`
    );
    this.name = "VectorIndexCapacityError";
  }
}

export class VectorDuplicateIdError extends VectorValidationError {
  constructor(id: string) {
    super("duplicate-id", `vector index already contains id "${id}"; use upsert to replace it`);
    this.name = "VectorDuplicateIdError";
  }
}

function invalid(
  code: VectorErrorCode,
  path: string,
  message: string
): VectorValidationError {
  return new VectorValidationError(code, `${path}: ${message}`, [message]);
}

export function assertValidDimension(dimensions: number): number {
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw invalid("invalid-dimension", "dimensions", "dimensions must be a positive integer");
  }
  if (dimensions > MEMORY_LIMITS.MAX_VECTOR_DIMENSIONS) {
    throw invalid(
      "invalid-dimension",
      "dimensions",
      `dimensions exceed the ${MEMORY_LIMITS.MAX_VECTOR_DIMENSIONS} bound`
    );
  }
  return dimensions;
}

export function assertVectorValue(value: unknown, label = "vector"): number[] {
  try {
    assertEmbeddingVector(value, label);
    return (value as number[]).map((entry) => entry);
  } catch (error) {
    if (error instanceof EmbeddingValidationError) {
      throw invalid(
        "invalid-vector",
        label,
        error.issues.map((entry) => entry.message).join("; ")
      );
    }
    throw error;
  }
}

export function assertVectorDimensionMatches(vector: number[], dimensions: number): void {
  if (vector.length !== dimensions) {
    throw invalid(
      "dimension-mismatch",
      "dimensions",
      `vector length ${vector.length} does not match index dimension ${dimensions}`
    );
  }
}

export function assertVectorId(idValue: unknown): string {
  if (typeof idValue !== "string" || idValue.trim() === "") {
    throw invalid("invalid-id", "id", "id must be a non-empty string");
  }
  if (idValue.length > MEMORY_LIMITS.MAX_SOURCE_ID_CHARS) {
    throw invalid("invalid-id", "id", "id exceeds the length bound");
  }
  return idValue;
}

export function validateVectorMetadata(metadata: unknown): VectorMetadata | undefined {
  if (metadata === undefined) return undefined;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw invalid("invalid-vector", "metadata", "metadata must be an object of string values");
  }
  const keys = Object.keys(metadata);
  if (keys.length > MEMORY_LIMITS.MAX_VECTOR_METADATA_KEYS) {
    throw invalid("invalid-vector", "metadata", "metadata exceeds the key count bound");
  }
  const result: VectorMetadata = {};
  for (const key of keys) {
    if (key.length > MEMORY_LIMITS.MAX_VECTOR_METADATA_KEY_CHARS) {
      throw invalid("invalid-vector", `metadata.${key}`, "metadata key exceeds the length bound");
    }
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value !== "string" || value.length > MEMORY_LIMITS.MAX_VECTOR_METADATA_VALUE_CHARS) {
      throw invalid(
        "invalid-vector",
        `metadata.${key}`,
        "metadata value must be a string within the length bound"
      );
    }
    result[key] = value;
  }
  return result;
}

export function assertVectorRecord(value: unknown): VectorRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("invalid-vector", "record", "record must be an object");
  }
  const record = value as Partial<VectorRecord>;
  const id = assertVectorId(record.id);
  const vector = assertVectorValue(record.vector);
  const metadata = validateVectorMetadata(record.metadata);
  return { id, vector, metadata };
}

/**
 * Validates/clamps a search topK against the central policy: throws for
 * non-integers or values below 1; clamps oversized values to the cap.
 */
export function resolveTopK(topK: number | undefined): number {
  if (topK === undefined) return MEMORY_LIMITS.DEFAULT_VECTOR_SEARCH_TOP_K;
  if (!Number.isInteger(topK)) {
    throw invalid("invalid-topk", "topK", "topK must be an integer");
  }
  if (topK < 1) {
    throw invalid("invalid-topk", "topK", "topK must be at least 1");
  }
  return clamp(topK, 1, MEMORY_LIMITS.MAX_VECTOR_SEARCH_TOP_K);
}

export function clampIndexCapacity(capacity: number | undefined): number {
  const floor = Math.max(1, Math.floor(capacity ?? MEMORY_LIMITS.DEFAULT_VECTOR_INDEX_CAPACITY));
  return clamp(floor, 1, MEMORY_LIMITS.MAX_VECTOR_INDEX_CAPACITY);
}