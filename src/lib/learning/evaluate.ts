/**
 * M4.5 – Deterministic Self-Evaluation
 * Compares expected outcomes against actual outcomes with fixed scores.
 */

import type {
  FailureCategory,
  LearningOutcome,
} from "./types";
import { clampScore, round6 } from "./scoring";

export interface SelfEvaluationInput {
  expectedOutcome: string;
  actualOutcome: string;
  expectedConfidence?: number;
  actualConfidence?: number;
  evidenceQuality?: number;
  sourceReliability?: number;
  completenessTotal?: number;
  completenessAchieved?: number;
  reproducible?: boolean;
  failureCategory?: FailureCategory;
}

export interface EvaluationDimension {
  dimension: string;
  score: number;
  weight: number;
}

export interface EvaluationOutcome {
  outcome: LearningOutcome;
  correctness: number;
  completeness: number;
  evidenceQuality: number;
  sourceReliability: number;
  confidenceCalibration: number;
  failureCategory: FailureCategory;
  reproducible: boolean;
  overallScore: number;
  breakdown: EvaluationDimension[];
}

const WEIGHTS = {
  correctness: 0.35,
  completeness: 0.15,
  evidenceQuality: 0.15,
  sourceReliability: 0.15,
  calibration: 0.2,
};

export function textTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);

  return [...new Set(words)].sort();
}

export function jaccard(a: string, b: string): number {
  const tokensA = new Set(textTokens(a));
  const tokensB = new Set(textTokens(b));

  const union = new Set([...tokensA, ...tokensB]);
  if (union.size === 0) return 1;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  return intersection / union.size;
}

export function determineOutcome(
  expected: string,
  actual: string,
  similarity: number,
  completeness: number
): LearningOutcome {
  if (expected.trim() === actual.trim()) return "success";
  if (similarity >= 0.6 || completeness >= 0.8) return "partial";
  return "failure";
}

export function evaluateOutcome(input: SelfEvaluationInput): EvaluationOutcome {
  const expected = input.expectedOutcome ?? "";
  const actual = input.actualOutcome ?? "";

  const correctness = round6(jaccard(expected, actual));

  const total = input.completenessTotal ?? 0;
  const achieved = input.completenessAchieved ?? 0;
  const completeness =
    total > 0
      ? round6(clampScore(achieved / total))
      : round6(correctness);

  const evidenceQuality = round6(clampScore(input.evidenceQuality ?? 0.5));
  const sourceReliability = round6(clampScore(input.sourceReliability ?? 0.5));

  const outcome = determineOutcome(expected, actual, correctness, completeness);

  const realizedConfidence =
    outcome === "success" ? 0.9 : outcome === "failure" ? 0.25 : 0.55;
  const expectedConfidence = clampScore(input.expectedConfidence ?? 0.5);
  const calibration = round6(1 - Math.abs(expectedConfidence - realizedConfidence));

  const overallScore = round6(
    correctness * WEIGHTS.correctness +
      completeness * WEIGHTS.completeness +
      evidenceQuality * WEIGHTS.evidenceQuality +
      sourceReliability * WEIGHTS.sourceReliability +
      calibration * WEIGHTS.calibration
  );

  const failureCategory: FailureCategory = input.failureCategory ?? "unknown";

  return {
    outcome,
    correctness,
    completeness,
    evidenceQuality,
    sourceReliability,
    confidenceCalibration: calibration,
    failureCategory,
    reproducible: input.reproducible ?? true,
    overallScore,
    breakdown: [
      { dimension: "correctness", score: correctness, weight: WEIGHTS.correctness },
      { dimension: "completeness", score: completeness, weight: WEIGHTS.completeness },
      { dimension: "evidenceQuality", score: evidenceQuality, weight: WEIGHTS.evidenceQuality },
      { dimension: "sourceReliability", score: sourceReliability, weight: WEIGHTS.sourceReliability },
      { dimension: "confidenceCalibration", score: calibration, weight: WEIGHTS.calibration },
    ],
  };
}