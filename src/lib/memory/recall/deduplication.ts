/**
 * M5.9 – Duplicate suppression at the recall-result level.
 * Uses content hashing for exact duplicate detection.
 * Removes redundant entries while retaining the highest-ranked
 * representation deterministically. Never mutates underlying memory.
 */

import { contentHash } from "../lifecycle/duplicates";
import type { RankedCandidate, DeduplicatedCandidate } from "./types";

export function suppressDuplicates(
  ranked: RankedCandidate[]
): DeduplicatedCandidate[] {
  const seen = new Map<string, number>();
  const result: DeduplicatedCandidate[] = [];

  for (const candidate of ranked) {
    const hash = contentHash(candidate.memory.content);
    const existingIndex = seen.get(hash);

    if (existingIndex !== undefined) {
      const existing = result[existingIndex];
      if (candidate.score > existing.score) {
        result[existingIndex] = {
          ...candidate,
          deduplicated: true,
          recallReasons: [...candidate.recallReasons, "deduplicated"],
        };
      }
    } else {
      seen.set(hash, result.length);
      result.push({
        ...candidate,
        deduplicated: false,
      });
    }
  }

  return result;
}
