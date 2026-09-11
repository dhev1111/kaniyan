/**
 * M5.6 – Deterministic memory scoring.
 * Produces bounded 0..1 scores from explicit, documented signals.
 * No NaN, no Infinity, no external calls.
 */

import { clamp01, round6 } from "../util";
import { confidenceScore } from "../validation";
import type { MemoryImportance, MemoryReference } from "../types";

export interface MemoryScoringWeights {
  recency: number;
  importance: number;
  confidence: number;
  accessFrequency: number;
}

export const DEFAULT_SCORING_WEIGHTS: MemoryScoringWeights = {
  recency: 0.3,
  importance: 0.3,
  confidence: 0.2,
  accessFrequency: 0.2,
};

const IMPORTANCE_NUMERIC: Record<MemoryImportance, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

const RECENCY_HALF_LIFE_DAYS = 90;
const MAX_ACCESS_FREQUENCY = 100;

export function importanceNumeric(importance: MemoryImportance): number {
  return IMPORTANCE_NUMERIC[importance] ?? 0.5;
}

export function recencyScore(createdAt: string, asOf?: string): number {
  const now = asOf ? new Date(asOf) : new Date();
  const created = new Date(createdAt);
  const days = Math.max(0, (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  const score = Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS);
  return round6(clamp01(score));
}

export function accessFrequencyScore(
  lastAccessedAt: string | undefined,
  createdAt: string,
  asOf?: string
): number {
  if (!lastAccessedAt) return 0;
  const now = asOf ? new Date(asOf) : new Date();
  const created = new Date(createdAt);
  const accessed = new Date(lastAccessedAt);
  const totalDays = Math.max(1, (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  const daysSinceAccess = Math.max(0, (now.getTime() - accessed.getTime()) / (1000 * 60 * 60 * 24));
  const frequency = Math.min(MAX_ACCESS_FREQUENCY, totalDays / Math.max(1, daysSinceAccess));
  return round6(clamp01(frequency / MAX_ACCESS_FREQUENCY));
}

export function computeMemoryScore(
  memory: MemoryReference,
  weights: MemoryScoringWeights = DEFAULT_SCORING_WEIGHTS,
  asOf?: string
): number {
  const rec = recencyScore(memory.createdAt, asOf);
  const imp = importanceNumeric(memory.importance);
  const conf = confidenceScore(memory.confidence);
  const freq = accessFrequencyScore(memory.lastAccessedAt, memory.createdAt, asOf);
  const raw =
    weights.recency * rec +
    weights.importance * imp +
    weights.confidence * conf +
    weights.accessFrequency * freq;
  return round6(clamp01(raw));
}

export function scoreMemories(
  memories: MemoryReference[],
  weights: MemoryScoringWeights = DEFAULT_SCORING_WEIGHTS,
  asOf?: string
): Array<{ id: string; score: number }> {
  return memories
    .map((memory) => ({ id: memory.id, score: computeMemoryScore(memory, weights, asOf) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function validateWeights(weights: unknown): weights is MemoryScoringWeights {
  if (!weights || typeof weights !== "object" || Array.isArray(weights)) return false;
  const candidate = weights as Record<string, unknown>;
  for (const key of ["recency", "importance", "confidence", "accessFrequency"]) {
    if (typeof candidate[key] !== "number") return false;
    if (!Number.isFinite(candidate[key])) return false;
  }
  return true;
}