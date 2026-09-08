/**
 * M4.4 – Claim Verifier
 * Cross-checks claims across multiple sources.
 */

import type {
  ExtractedClaim,
  VerificationResult,
  VerificationStatus,
} from "./types";

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Very simple overlap check between two claims.
 */
function claimsSimilar(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);

  if (na === nb) return true;

  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const minSize = Math.min(wordsA.size, wordsB.size);
  if (minSize === 0) return false;

  return intersection / minSize >= 0.45;
}

export function verifyClaims(
  claims: ExtractedClaim[]
): VerificationResult[] {
  const results: VerificationResult[] = [];

  for (const claim of claims) {
    const supporting: string[] = [];
    const conflicting: string[] = [];

    for (const other of claims) {
      if (other.id === claim.id) continue;

      if (claimsSimilar(claim.claim, other.claim)) {
        if (!supporting.includes(other.sourceUrl)) {
          supporting.push(other.sourceUrl);
        }
      }
    }

    // Always count its own source as support
    if (!supporting.includes(claim.sourceUrl)) {
      supporting.unshift(claim.sourceUrl);
    }

    let status: VerificationStatus = "unverified";
    let confidence = 0.4;

    if (supporting.length >= 3) {
      status = "verified";
      confidence = 0.85;
    } else if (supporting.length === 2) {
      status = "supported";
      confidence = 0.7;
    } else {
      status = "unverified";
      confidence = 0.45;
    }

    results.push({
      claimId: claim.id,
      status,
      supportingSources: supporting,
      conflictingSources: conflicting,
      confidence,
    });
  }

  return results;
}
