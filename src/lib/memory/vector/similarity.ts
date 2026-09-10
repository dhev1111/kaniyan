/**
 * M5.3 – Deterministic cosine similarity and result ordering.
 * Pure math with no storage knowledge: dimension mismatches and malformed
 * vectors are rejected; zero-magnitude vectors score 0; results never
 * contain NaN or Infinity.
 */

import { round6 } from "../util";
import { EmbeddingValidationError, assertEmbeddingVector } from "../embedding/validation";

/**
 * Computes deterministic cosine similarity for two equal-dimension vectors.
 * Returns 0 when either magnitude is zero (instead of NaN); throws a typed
 * error for empty, non-finite or dimension-mismatched input.
 */
export function cosineSimilarity(left: unknown, right: unknown): number {
  assertEmbeddingVector(left, "left vector");
  assertEmbeddingVector(right, "right vector");
  const a = left as number[];
  const b = right as number[];
  if (a.length !== b.length) {
    throw new EmbeddingValidationError(
      [
        {
          path: "dimension",
          message: `dimension mismatch: ${a.length} vs ${b.length}`,
        },
      ],
      "cosine similarity"
    );
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magA += a[index] * a[index];
    magB += b[index] * b[index];
  }
  if (magA === 0 || magB === 0) {
    return 0;
  }
  const score = dot / Math.sqrt(magA * magB);
  return round6(Math.max(-1, Math.min(1, score)));
}

/** Ascending ID tie-break, used everywhere equal scores must be ordered. */
export function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Deterministic ordering: score descending, then stable ID ascending. */
export function compareVectorResults(left: { id: string; score: number }, right: { id: string; score: number }): number {
  if (left.score !== right.score) {
    return left.score > right.score ? -1 : 1;
  }
  return compareIds(left.id, right.id);
}