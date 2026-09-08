/**
 * M4.4 – Final Ranking
 */

import type {
  ExtractedClaim,
  VerificationResult,
  RankedFinding,
  SourceTrustLevel,
} from "./types";
import { getTrustLevel } from "./sources";

export function rankFindings(
  claims: ExtractedClaim[],
  verifications: VerificationResult[]
): RankedFinding[] {
  const verificationMap = new Map(
    verifications.map((v) => [v.claimId, v])
  );

  const ranked: RankedFinding[] = claims.map((claim) => {
    const verification = verificationMap.get(claim.id) || {
      claimId: claim.id,
      status: "unknown" as const,
      supportingSources: [claim.sourceUrl],
      conflictingSources: [],
      confidence: 0.3,
    };

    const trustLevel: SourceTrustLevel = getTrustLevel(claim.sourceUrl);

    let score = 40;

    // Trust bonus
    switch (trustLevel) {
      case "official":
        score += 35;
        break;
      case "reputable":
        score += 22;
        break;
      case "community":
        score += 10;
        break;
      case "suspicious":
        score -= 25;
        break;
    }

    // Verification bonus
    switch (verification.status) {
      case "verified":
        score += 25;
        break;
      case "supported":
        score += 15;
        break;
      case "conflicting":
        score -= 10;
        break;
    }

    score += verification.confidence * 10;
    score += claim.confidence * 5;

    return {
      claim,
      verification,
      trustLevel,
      finalScore: Math.round(score * 10) / 10,
      rank: 0,
    };
  });

  // Sort by score descending
  ranked.sort((a, b) => b.finalScore - a.finalScore);

  // Assign rank
  ranked.forEach((item, index) => {
    item.rank = index + 1;
  });

  return ranked;
}
