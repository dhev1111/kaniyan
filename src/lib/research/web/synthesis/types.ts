/**
 * M4.5 – Research Synthesis Types
 * Deterministic synthesis over verified web-research evidence.
 */

import type {
  VerificationStatus,
  SourceTrustLevel,
} from "../types";

export type SynthesisState =
  | "supported"
  | "partially_supported"
  | "conflicting"
  | "insufficient_evidence";

export interface EvidenceReference {
  claimId: string;
  sourceUrl: string;
  trustLevel: SourceTrustLevel;
  verificationStatus: VerificationStatus;
  claimConfidence: number;
  finalScore: number;
  evidenceWeight: number;
}

export interface SynthesizedClaim {
  id: string;
  claim: string;
  normalizedClaim: string;
  state: SynthesisState;
  evidence: EvidenceReference[];
  supportingClaimIds: string[];
  conflictingClaimIds: string[];
  distinctSources: number;
  weight: number;
  coverage: number;
  reason: string;
}

export interface EvidenceGroup {
  key: string;
  representativeId: string;
  findings: import("../types").RankedFinding[];
}

export interface SynthesisMetrics {
  totalFindings: number;
  groups: number;
  duplicatesRemoved: number;
  distinctSources: number;
  conflicts: number;
  synthesizedClaims: number;
  supported: number;
  partiallySupported: number;
  conflicting: number;
  insufficientEvidence: number;
}

export interface SynthesisResult {
  query: string;
  synthesizedAt: string;
  claims: SynthesizedClaim[];
  metrics: SynthesisMetrics;
  warnings: string[];
  sourceTraceability: string[];
}