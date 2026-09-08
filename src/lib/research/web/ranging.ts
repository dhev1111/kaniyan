import type { RankedFinding } from "./types";

export interface RangeOptions {
  limit?: number;
  minScore?: number;
}

export interface RangedResult extends RankedFinding {
  score: number;
}

/**
 * Rank web-research findings by final score, verification confidence,
 * and claim confidence.
 */
export function rangeResults(
  results: RankedFinding[],
  options: RangeOptions = {},
): RangedResult[] {
  const { limit = results.length, minScore = 0 } = options;

  const scored = results.map((result) => ({
    ...result,
    score: calculateScore(result),
  }));

  const filtered = scored
    .filter((result) => result.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit));

  return filtered.map((result, index) => ({
    ...result,
    rank: index + 1,
  }));
}

/**
 * Calculate a normalized score from 0–1.
 */
function calculateScore(result: RankedFinding): number {
  const finalScore = normalize(result.finalScore);
  const verification = normalize(result.verification.confidence);
  const claimConfidence = normalize(result.claim.confidence);

  return (
    finalScore * 0.7 +
    verification * 0.2 +
    claimConfidence * 0.1
  );
}

/**
 * Accept either a 0–1 or 0–100 score.
 */
function normalize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  if (value > 1) {
    return Math.min(100, Math.max(0, value)) / 100;
  }

  return Math.min(1, Math.max(0, value));
}