/**
 * M5.9 – Deterministic recall ranking.
 * Uses existing M5.6 scoring infrastructure with deterministic tie-breaking
 * by memory ID. No randomness, no external calls.
 */

import { round6 } from "../util";
import {
  computeMemoryScore,
  DEFAULT_SCORING_WEIGHTS,
} from "../lifecycle/scoring";
import type { MemoryScoringWeights } from "../lifecycle/scoring";
import type { RecallCandidate, RankedCandidate } from "./types";

export function rankCandidates(
  candidates: RecallCandidate[],
  weights: MemoryScoringWeights = DEFAULT_SCORING_WEIGHTS,
  asOf?: string
): RankedCandidate[] {
  const scored = candidates.map(candidate => {
    const score = round6(computeMemoryScore(candidate.memory, weights, asOf));
    return {
      ...candidate,
      score,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.memory.id.localeCompare(b.memory.id);
  });

  return scored;
}
