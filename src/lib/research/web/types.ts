/**
 * M4.4 – Real Web Research Types
 * Security-first, provenance-aware types for controlled web research.
 */

export type SourceTrustLevel =
  | "official"
  | "reputable"
  | "community"
  | "unknown"
  | "suspicious";

export type VerificationStatus =
  | "verified"
  | "supported"
  | "conflicting"
  | "unverified"
  | "unknown";

export type WebContentType =
  | "text/html"
  | "text/plain"
  | "application/xhtml+xml"
  | "application/xml"
  | "other";

export interface WebSearchQuery {
  query: string;
  maxResults?: number;
  language?: string;
  freshnessDays?: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
  source?: string;
}

export interface WebPage {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: WebContentType;
  rawText: string;
  sizeBytes: number;
  fetchedAt: string;
  redirectCount: number;
  title?: string;
}

export interface ExtractedClaim {
  id: string;
  claim: string;
  supportingQuote: string;
  confidence: number;
  sourceUrl: string;
  extractedAt: string;
}

export interface VerificationResult {
  claimId: string;
  status: VerificationStatus;
  supportingSources: string[];
  conflictingSources: string[];
  notes?: string;
  confidence: number;
}

export interface RankedFinding {
  claim: ExtractedClaim;
  verification: VerificationResult;
  trustLevel: SourceTrustLevel;
  finalScore: number;
  rank: number;
}

export interface WebResearchOptions {
  maxSources?: number;
  maxClaimsPerPage?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface WebResearchResult {
  query: string;
  searchedAt: string;
  searchResults: WebSearchResult[];
  pagesFetched: WebPage[];
  claims: ExtractedClaim[];
  verifications: VerificationResult[];
  rankedFindings: RankedFinding[];
  warnings: string[];
  metrics: {
    searchTimeMs: number;
    fetchTimeMs: number;
    totalTimeMs: number;
    sourcesSelected: number;
    sourcesFetched: number;
    sourcesFailed: number;
  };
}