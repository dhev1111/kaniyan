/**
 * M4.5 – Deterministic Conflict Detection
 * Detects evidence that asserts opposing claims.
 */

import type { RankedFinding } from "../types";
import { claimsOverlap, negationScore } from "./grouping";

export interface EvidenceConflict {
  claimAId: string;
  claimBId: string;
  reason: string;
}

export interface ConflictReport {
  conflicts: EvidenceConflict[];
}

const CONFLICT_OVERLAP_THRESHOLD = 0.55;

export function claimsAssertOpposites(a: RankedFinding, b: RankedFinding): boolean {
  if (a.claim.id === b.claim.id) return false;

  const overlap = claimsOverlap(
    a.claim.claim,
    b.claim.claim,
    CONFLICT_OVERLAP_THRESHOLD
  );
  if (!overlap) return false;

  const negA = negationScore(a.claim.claim);
  const negB = negationScore(b.claim.claim);

  return (negA === 0 && negB > 0) || (negA > 0 && negB === 0);
}

export function detectConflicts(
  findings: RankedFinding[]
): ConflictReport {
  const conflicts: EvidenceConflict[] = [];

  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i];
      const b = findings[j];

      if (claimsAssertOpposites(a, b)) {
        conflicts.push({
          claimAId: a.claim.id,
          claimBId: b.claim.id,
          reason: "one claim asserts a statement while another negates it",
        });
      }
    }
  }

  return { conflicts };
}