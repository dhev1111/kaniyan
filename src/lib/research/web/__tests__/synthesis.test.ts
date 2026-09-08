import type {
  RankedFinding,
  SourceTrustLevel,
  VerificationStatus,
  WebResearchResult,
} from "../types";
import {
  groupFindings,
  normalizeClaimText,
  claimsOverlap,
  jaccardSimilarity,
} from "../synthesis/grouping";
import { deduplicateFindings } from "../synthesis/deduplication";
import { detectConflicts } from "../synthesis/conflicts";
import {
  synthesizeResearch,
  synthesizeGroup,
  evidenceWeight,
  clamp01,
  normalizeScore,
} from "../synthesis/synthesize";

function finding(
  id: string,
  claim: string,
  url: string,
  overrides: {
    status?: VerificationStatus;
    trustLevel?: SourceTrustLevel;
    claimConfidence?: number;
    verifConfidence?: number;
    finalScore?: number;
    rank?: number;
  } = {}
): RankedFinding {
  return {
    claim: {
      id,
      claim,
      supportingQuote: claim,
      confidence: overrides.claimConfidence ?? 0.7,
      sourceUrl: url,
      extractedAt: "2026-01-01T00:00:00.000Z",
    },
    verification: {
      claimId: id,
      status: overrides.status ?? "unverified",
      supportingSources: [url],
      conflictingSources: [],
      confidence: overrides.verifConfidence ?? 0.6,
    },
    trustLevel: overrides.trustLevel ?? "reputable",
    finalScore: overrides.finalScore ?? 70,
    rank: overrides.rank ?? 1,
  };
}

function researchResult(
  query: string,
  findings: RankedFinding[]
): WebResearchResult {
  return {
    query,
    searchedAt: "2026-01-01T00:00:00.000Z",
    searchResults: [],
    pagesFetched: [],
    claims: findings.map((f) => f.claim),
    verifications: findings.map((f) => f.verification),
    rankedFindings: findings,
    warnings: [],
    metrics: {
      searchTimeMs: 0,
      fetchTimeMs: 0,
      totalTimeMs: 0,
      sourcesSelected: findings.length,
      sourcesFetched: findings.length,
      sourcesFailed: 0,
    },
  };
}

const NOW = "2026-01-02T00:00:00.000Z";

describe("M4.5 – claim normalization", () => {
  it("normalizes case, punctuation, and whitespace deterministically", () => {
    expect(normalizeClaimText("The API Supports  Streaming !")).toBe(
      normalizeClaimText("the api supports streaming")
    );
  });

  it("measures overlap and jaccard similarity deterministically", () => {
    expect(claimsOverlap("The API supports streaming", "The API supports streaming well")).toBe(true);
    expect(jaccardSimilarity("alpha beta gamma", "alpha beta delta")).toBe(0.5);
  });
});

describe("M4.5 – evidence grouping", () => {
  it("groups related claims from distinct sources", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/doc"),
      finding("c2", "The API supports streaming", "https://b.example.com/doc"),
      finding("c3", "Completely unrelated statement", "https://c.example.com/doc"),
    ];

    const groups = groupFindings(findings);
    expect(groups.length).toBe(2);
    expect(groups[0].findings.length).toBe(2);
  });

  it("produces identical groups for identical input order", () => {
    const findings = [
      finding("c1", "Alpha supports beta", "https://a.example.com/1"),
      finding("c2", "Alpha supports beta", "https://a.example.com/2"),
      finding("c3", "Gamma does not support delta", "https://b.example.com/1"),
    ];
    expect(groupFindings(findings)).toEqual(groupFindings(findings.slice()));
  });
});

describe("M4.5 – duplicate detection", () => {
  it("deduplicates identical claims from the same source", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/doc"),
      finding("c2", "The API supports streaming", "https://a.example.com/doc"),
    ];

    const result = deduplicateFindings(findings);
    expect(result.removed).toBe(1);
    expect(result.findings.length).toBe(1);
  });

  it("keeps the same claim from distinct sources", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/doc"),
      finding("c2", "The API supports streaming", "https://b.example.com/doc"),
    ];

    const result = deduplicateFindings(findings);
    expect(result.removed).toBe(0);
    expect(result.findings.length).toBe(2);
  });
});

describe("M4.5 – conflict detection", () => {
  it("detects an assertion and its negation as conflicting", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/doc"),
      finding("c2", "The API does not support streaming", "https://b.example.com/doc"),
    ];

    const { conflicts } = detectConflicts(findings);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].claimAId).toBe("c1");
    expect(conflicts[0].claimBId).toBe("c2");
  });

  it("does not flag plain restatements as conflicts", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/doc"),
      finding("c2", "The API supports streaming too", "https://b.example.com/doc"),
    ];

    const { conflicts } = detectConflicts(findings);
    expect(conflicts.length).toBe(0);
  });
});

describe("M4.5 – synthesis states", () => {
  it("marks a claim supported with three independent sources", () => {
    const findings = [
      finding("c1", "Next.js supports React 19", "https://nextjs.org/docs", {
        status: "verified",
        trustLevel: "official",
        claimConfidence: 0.8,
        verifConfidence: 0.85,
        finalScore: 90,
      }),
      finding("c2", "Next.js supports React 19", "https://react.dev/blog", {
        status: "supported",
        trustLevel: "official",
        claimConfidence: 0.75,
        verifConfidence: 0.7,
        finalScore: 80,
      }),
      finding("c3", "Next.js supports React 19", "https://example.com/notes", {
        status: "supported",
        trustLevel: "reputable",
        claimConfidence: 0.7,
        verifConfidence: 0.7,
        finalScore: 75,
      }),
    ];

    const result = synthesizeResearch(researchResult("react 19", findings), {
      now: NOW,
    });
    expect(result.metrics.supported).toBe(1);
    expect(result.claims[0].state).toBe("supported");
    expect(result.claims[0].distinctSources).toBe(3);
  });

  it("marks a claim partially supported with two sources", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/1"),
      finding("c2", "The API supports streaming", "https://b.example.com/1"),
    ];

    const result = synthesizeResearch(researchResult("streaming", findings), {
      now: NOW,
    });
    expect(result.claims[0].state).toBe("partially_supported");
  });

  it("marks a single-source claim as insufficient evidence", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/1"),
    ];

    const result = synthesizeResearch(researchResult("streaming", findings), {
      now: NOW,
    });
    expect(result.claims[0].state).toBe("insufficient_evidence");
  });

  it("preserves conflicting evidence instead of hiding it", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/1", {
        status: "conflicting",
        claimConfidence: 0.8,
      }),
      finding("c2", "The API does not support streaming", "https://b.example.com/1", {
        status: "conflicting",
        claimConfidence: 0.8,
      }),
    ];

    const result = synthesizeResearch(researchResult("streaming", findings), {
      now: NOW,
    });
    expect(result.metrics.conflicting).toBe(1);
    expect(result.claims[0].state).toBe("conflicting");
    expect(result.claims[0].conflictingClaimIds.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("conflict"))).toBe(true);
  });

  it("returns insufficient_evidence explicitly when no evidence exists", () => {
    const result = synthesizeResearch(researchResult("nothing", []), { now: NOW });
    expect(result.claims.length).toBe(0);
    expect(result.warnings).toContain("no evidence available for synthesis");
    expect(result.metrics.insufficientEvidence).toBe(0);
  });
});

describe("M4.5 – source traceability and non-fabrication", () => {
  it("references only real sources and claims", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/doc", {
        status: "verified",
        trustLevel: "official",
      }),
      finding("c2", "The API supports streaming", "https://b.example.com/doc", {
        status: "supported",
      }),
      finding("c3", "The API supports streaming", "https://c.example.com/doc", {
        status: "supported",
      }),
    ];
    const realUrls = new Set(findings.map((f) => f.claim.sourceUrl));
    const realIds = new Set(findings.map((f) => f.claim.id));

    const result = synthesizeResearch(researchResult("streaming", findings), {
      now: NOW,
    });

    for (const claim of result.claims) {
      for (const reference of claim.evidence) {
        expect(realUrls.has(reference.sourceUrl)).toBe(true);
        expect(realIds.has(reference.claimId)).toBe(true);
      }
      expect(claim.evidence.length).toBeGreaterThan(0);
    }

    expect(result.sourceTraceability.length).toBeGreaterThan(0);
    expect(result.sourceTraceability[0]).toContain("<- source");
  });

  it("never fabricates the synthesized claim statement", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/1"),
    ];
    const realTexts = new Set(findings.map((f) => f.claim.claim));

    const result = synthesizeResearch(researchResult("streaming", findings), {
      now: NOW,
    });
    expect(realTexts.has(result.claims[0].claim)).toBe(true);
  });
});

describe("M4.5 – synthesis determinism", () => {
  it("produces identical output for identical input", () => {
    const findings = [
      finding("c1", "The API supports streaming", "https://a.example.com/1", {
        status: "supported",
      }),
      finding("c2", "The API supports streaming", "https://b.example.com/1", {
        status: "supported",
      }),
      finding("c3", "The API does not support streaming", "https://c.example.com/1"),
    ];

    const first = synthesizeResearch(researchResult("streaming", findings), {
      now: NOW,
    });
    const second = synthesizeResearch(researchResult("streaming", findings), {
      now: NOW,
    });
    expect(first).toEqual(second);
  });
});

describe("M4.5 – scoring helpers", () => {
  it("computes evidence weight inside [0, 1]", () => {
    const weight = evidenceWeight(
      finding("c1", "The API supports streaming", "https://a.example.com/1", {
        status: "verified",
        trustLevel: "official",
        claimConfidence: 0.9,
        verifConfidence: 0.9,
        finalScore: 95,
      })
    );
    expect(weight).toBeGreaterThanOrEqual(0);
    expect(weight).toBeLessThanOrEqual(1);
  });

  it("clamps and normalizes scores without NaN", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(normalizeScore(90)).toBe(0.9);
    expect(normalizeScore(0.5)).toBe(0.5);
  });

  it("builds a synthesized claim with traceable evidence via synthesizeGroup", () => {
    const group = groupFindings([
      finding("c1", "The API supports streaming", "https://a.example.com/1", {
        status: "verified",
        trustLevel: "official",
      }),
      finding("c2", "The API supports streaming", "https://b.example.com/1", {
        status: "supported",
      }),
    ])[0];

    const claim = synthesizeGroup(group, 3);
    expect(claim.evidence.length).toBe(2);
    expect(isSupportedState(claim.state)).toBe(true);
  });
});

function isSupportedState(state: string): boolean {
  return state === "partially_supported" || state === "supported";
}