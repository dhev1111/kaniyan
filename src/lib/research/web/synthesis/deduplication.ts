/**
 * M4.5 – Deterministic Evidence Deduplication
 * Collapses near-duplicate claims within a body of evidence.
 */

import type { RankedFinding } from "../types";
import { normalizeClaimText } from "./grouping";

export interface DeduplicationResult {
  findings: RankedFinding[];
  removed: number;
}

export function isDuplicatePair(a: RankedFinding, b: RankedFinding): boolean {
  if (a.claim.id === b.claim.id) return true;
  if (a.claim.sourceUrl !== b.claim.sourceUrl) return false;
  return normalizeClaimText(a.claim.claim) === normalizeClaimText(b.claim.claim);
}

export function deduplicateFindings(
  findings: RankedFinding[]
): DeduplicationResult {
  const kept: RankedFinding[] = [];
  let removed = 0;

  for (const finding of findings) {
    let duplicate = false;
    for (const existing of kept) {
      if (isDuplicatePair(existing, finding)) {
        duplicate = true;
        break;
      }
    }

    if (duplicate) {
      removed++;
    } else {
      kept.push(finding);
    }
  }

  kept.sort(
    (a, b) =>
      b.finalScore - a.finalScore || a.claim.id.localeCompare(b.claim.id)
  );

  return { findings: kept, removed };
}