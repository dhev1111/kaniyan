/**
 * M4.5 – Research Synthesis
 * Combines verified findings into evidence-backed claims.
 */

import type {
  RankedFinding,
  WebResearchResult,
} from "../types";
import type {
  EvidenceReference,
  SynthesisResult,
  SynthesizedClaim,
  EvidenceGroup,
  SynthesisState,
} from "./types";
import { groupFindings, normalizeClaimText } from "./grouping";
import { deduplicateFindings } from "./deduplication";
import { detectConflicts } from "./conflicts";

export interface SynthesisOptions {
  now?: string;
  minEvidenceSources?: number;
}

const DEFAULT_MIN_SOURCES = 3;
const SUPPORTED_MEAN_WEIGHT = 0.5;

const TRUST_SCORE: Record<string, number> = {
  official: 1,
  reputable: 0.8,
  community: 0.5,
  unknown: 0.35,
  suspicious: 0.1,
};

const VERIFICATION_SCORE: Record<string, number> = {
  verified: 1,
  supported: 0.7,
  conflicting: 0.2,
  unverified: 0.4,
  unknown: 0.3,
};

export function evidenceWeight(finding: RankedFinding): number {
  const trustScore = TRUST_SCORE[finding.trustLevel] ?? 0.3;
  const verificationScore =
    VERIFICATION_SCORE[finding.verification.status] ?? 0.3;

  const score =
    trustScore * 0.25 +
    verificationScore * 0.3 +
    clamp01(finding.claim.confidence) * 0.15 +
    clamp01(finding.verification.confidence) * 0.2 +
    normalizeScore(finding.finalScore) * 0.1;

  return round3(score);
}

export function synthesizeGroup(
  group: EvidenceGroup,
  minSources: number
): SynthesizedClaim {
  const deduped = deduplicateFindings(group.findings);
  const { conflicts } = detectConflicts(deduped.findings);

  const representative = group.findings[0];
  const claimText = representative.claim.claim;
  const claimId = representative.claim.id;

  const evidence = deduped.findings.map<EvidenceReference>((finding) => ({
    claimId: finding.claim.id,
    sourceUrl: finding.claim.sourceUrl,
    trustLevel: finding.trustLevel,
    verificationStatus: finding.verification.status,
    claimConfidence: finding.claim.confidence,
    finalScore: finding.finalScore,
    evidenceWeight: evidenceWeight(finding),
  }));

  const distinctSources = new Set(
    evidence.map((reference) => reference.sourceUrl)
  ).size;

  const supportingClaimIds = deduped.findings
    .filter((finding) => finding.verification.status !== "conflicting")
    .map((finding) => finding.claim.id)
    .sort();

  const conflictClaimIds = conflicts
    .flatMap((conflict) => [conflict.claimAId, conflict.claimBId])
    .filter((id) => id !== claimId)
    .sort();

  const meanWeight =
    evidence.length === 0
      ? 0
      : round3(evidence.reduce((sum, ref) => sum + ref.evidenceWeight, 0) / evidence.length);

  const conflictingClaimIds = [...new Set(conflictClaimIds)].sort();

  let state: SynthesisState;
  let reason: string;

  if (conflictingClaimIds.length > 0 || evidence.some((ref) => ref.verificationStatus === "conflicting")) {
    state = "conflicting";
    reason = "evidence asserts opposing claims and the conflict is preserved";
  } else if (distinctSources >= minSources && meanWeight >= SUPPORTED_MEAN_WEIGHT) {
    state = "supported";
    reason = `supported by ${distinctSources} independent sources (mean weight ${meanWeight})`;
  } else if (distinctSources >= 2) {
    state = "partially_supported";
    reason = `supported by ${distinctSources} sources but below the ${minSources}-source threshold`;
  } else {
    state = "insufficient_evidence";
    reason = `insufficient independent evidence (1 source, ${minSources} required)`;
  }

  return {
    id: `syn-${claimId}`,
    claim: claimText,
    normalizedClaim: normalizeClaimText(claimText),
    state,
    evidence,
    supportingClaimIds,
    conflictingClaimIds,
    distinctSources: distinctSources,
    weight: meanWeight,
    coverage: round3(Math.min(1, distinctSources / minSources)),
    reason,
  };
}

export function synthesizeResearch(
  result: WebResearchResult,
  options: SynthesisOptions = {}
): SynthesisResult {
  const minSources = options.minEvidenceSources ?? DEFAULT_MIN_SOURCES;
  const synthesizedAt = options.now ?? new Date().toISOString();
  const warnings: string[] = [];

  const totalFindings = result.rankedFindings.length;

  if (totalFindings === 0) {
    return {
      query: result.query,
      synthesizedAt,
      claims: [],
      metrics: {
        totalFindings: 0,
        groups: 0,
        duplicatesRemoved: 0,
        distinctSources: 0,
        conflicts: 0,
        synthesizedClaims: 0,
        supported: 0,
        partiallySupported: 0,
        conflicting: 0,
        insufficientEvidence: 0,
      },
      warnings: ["no evidence available for synthesis"],
      sourceTraceability: [],
    };
  }

  const groups = groupFindings(result.rankedFindings);

  let duplicatesRemoved = 0;
  const claims: SynthesizedClaim[] = [];
  const sourceTraceability: string[] = [];
  let conflictsDetected = 0;

  groups.forEach((group, index) => {
    const claim = synthesizeGroup(group, minSources);
    const dedupedGroup = deduplicateFindings(group.findings);
    duplicatesRemoved += dedupedGroup.removed;

    claims.push(claim);

    if (claim.state === "conflicting") {
      conflictsDetected++;
      warnings.push(
        `evidence conflict preserved in synthesized claim ${index + 1}`
      );
    }

    for (const reference of claim.evidence) {
      sourceTraceability.push(
        `claim ${claim.id} <- source ${reference.sourceUrl} (${reference.claimId})`
      );
    }
  });

  const distinctSources = claims
    .flatMap((claim) => claim.evidence.map((ref) => ref.sourceUrl));

  const countState = (state: SynthesisState): number =>
    claims.filter((claim) => claim.state === state).length;

  return {
    query: result.query,
    synthesizedAt,
    claims,
    metrics: {
      totalFindings,
      groups: groups.length,
      duplicatesRemoved,
      distinctSources: new Set(distinctSources).size,
      conflicts: conflictsDetected,
      synthesizedClaims: claims.length,
      supported: countState("supported"),
      partiallySupported: countState("partially_supported"),
      conflicting: countState("conflicting"),
      insufficientEvidence: countState("insufficient_evidence"),
    },
    warnings: warnings.slice(),
    sourceTraceability: sourceTraceability.sort(),
  };
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value > 1 ? value / 100 : value;
  return clamp01(scaled);
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}