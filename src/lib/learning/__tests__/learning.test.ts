import { evaluateOutcome } from "../evaluate";
import { jaccard } from "../evaluate";
import {
  extractLessonsFromEvaluation,
  extractLessonsFromResearch,
  calibrateConfidence,
} from "../lessons";
import {
  retrieveLessons,
  contextSimilarity,
  DEFAULT_WEIGHTS,
} from "../retrieval";
import { LearningMemory } from "../memory";
import {
  evaluateProposal,
  approveForProduction,
  benefitEvaluationOf,
  staticValidationOf,
  sandboxEvaluationOf,
  regressionEvaluationOf,
  allowedRecommendations,
  type EvaluationDecision,
  type EvaluationInput,
  type ImprovementProposal,
  type SandboxGateReport,
  type RegressionReport,
  type BenefitMeasurement,
} from "../evolution";
import type { LearningRecord } from "../types";
import type { RankedFinding, WebResearchResult } from "../../research/web";
import { validateUrl, rangeResults } from "../../research/web";

const NOW = "2026-02-01T00:00:00.000Z";

function validProposal(overrides: Partial<ImprovementProposal> = {}): ImprovementProposal {
  return {
    id: "p1",
    title: "Improve ranking stability",
    category: "ranking",
    affectedComponent: "rankStabilityHeuristic",
    description: "Tighten tie-breaks in ranking.",
    evidenceRefs: ["e1"],
    confidence: 0.6,
    riskLevel: "low",
    securityImpact: "none",
    rollbackPlan: "revert to previous weights",
    ...overrides,
  };
}

function validSandboxReport(overrides: Partial<SandboxGateReport> = {}): SandboxGateReport {
  return {
    isolated: true,
    secretsAccessed: false,
    securityControlsTouched: false,
    tests: [
      {
        id: "t1",
        description: "deterministic fixture input",
        inputFingerprint: "fixture-a",
        baselineOutput: "baseline-a",
        proposedOutput: "improved-b",
        passed: true,
      },
    ],
    ...overrides,
  };
}

function validRegressionReport(overrides: Partial<RegressionReport> = {}): RegressionReport {
  return {
    checks: [
      {
        component: "rankStabilityHeuristic",
        behaviorFingerprint: "deterministic",
        unchanged: true,
      },
    ],
    ...overrides,
  };
}

function validBenefitMeasurement(overrides: Partial<BenefitMeasurement> = {}): BenefitMeasurement {
  return {
    measureable: true,
    evaluationMetric: "accuracy",
    baselineScore: 0.5,
    proposedScore: 0.8,
    testCount: 10,
    ...overrides,
  };
}

function evaluationInput(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    proposal: validProposal(),
    evidenceRegistry: new Set(["e1"]),
    sandboxReport: validSandboxReport(),
    regressionReport: validRegressionReport(),
    benefitMeasurement: validBenefitMeasurement(),
    ...overrides,
  };
}

function researchResult(findings: RankedFinding[], warnings: string[] = []): WebResearchResult {
  return {
    query: "streaming support",
    searchedAt: "2026-01-01T00:00:00.000Z",
    searchResults: [],
    pagesFetched: [],
    claims: findings.map((f) => f.claim),
    verifications: findings.map((f) => f.verification),
    rankedFindings: findings,
    warnings,
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

describe("M4.5 – self-evaluation", () => {
  it("evaluates identical inputs identically", () => {
    const input = {
      expectedOutcome: "three verified sources expected",
      actualOutcome: "three verified sources expected",
      expectedConfidence: 0.9,
    };
    expect(evaluateOutcome(input)).toEqual(evaluateOutcome({ ...input }));
  });

  it("reports success on exact match with calibrated confidence", () => {
    const outcome = evaluateOutcome({
      expectedOutcome: "verified claim produced",
      actualOutcome: "verified claim produced",
      expectedConfidence: 0.9,
    });
    expect(outcome.outcome).toBe("success");
    expect(outcome.confidenceCalibration).toBeGreaterThan(0.5);
  });

  it("reports failure on unrelated outcomes", () => {
    const outcome = evaluateOutcome({
      expectedOutcome: "all sources verified",
      actualOutcome: "all sources unreachable",
      expectedConfidence: 0.9,
    });
    expect(outcome.outcome).toBe("failure");
    expect(outcome.failureCategory).toBe("unknown");
  });

  it("computes reproducibility and a weighted overall score", () => {
    const outcome = evaluateOutcome({
      expectedOutcome: "a b c d",
      actualOutcome: "a b c d",
      reproducible: true,
      evidenceQuality: 0.9,
      sourceReliability: 0.9,
    });
    expect(outcome.reproducible).toBe(true);
    expect(outcome.overallScore).toBeGreaterThanOrEqual(0);
    expect(outcome.overallScore).toBeLessThanOrEqual(1);
    expect(jaccard).toBeDefined();
  });
});

describe("M4.5 – lesson extraction", () => {
  it("never turns an unsupported lesson into high confidence", () => {
    const lessons = extractLessonsFromEvaluation(
      { expectedOutcome: "x y", actualOutcome: "x y different here" },
      { taskId: "t1", source: "test" }
    );
    expect(lessons[0].confidence).toBeLessThanOrEqual(0.45);
  });

  it("raises confidence with supporting evidence but stays bounded", () => {
    const lessons = extractLessonsFromEvaluation(
      { expectedOutcome: "x y", actualOutcome: "x y" },
      {
        taskId: "t1",
        reviewerNotes: [
          { note: "confirmed", evidenceRef: "e1", confidence: 0.95 },
        ],
      }
    );
    expect(lessons[0].confidence).toBeGreaterThan(0.45);
    expect(calibrateConfidence(1, 1)).toBeLessThanOrEqual(0.9);
  });

  it("extracts conflict lessons from research with evidence references", () => {
    const findings: RankedFinding[] = [
      {
        claim: {
          id: "c1",
          claim: "The API supports streaming",
          supportingQuote: "quote",
          confidence: 0.8,
          sourceUrl: "https://a.example.com/1",
          extractedAt: NOW,
        },
        verification: {
          claimId: "c1",
          status: "conflicting",
          supportingSources: ["https://a.example.com/1"],
          conflictingSources: ["https://b.example.com/1"],
          confidence: 0.4,
        },
        trustLevel: "reputable",
        finalScore: 60,
        rank: 1,
      },
    ];

    const lessons = extractLessonsFromResearch(
      researchResult(findings),
      { taskId: "t2", source: "web-research" }
    );
    expect(lessons.some((l) => l.lesson.includes("conflict"))).toBe(true);
    expect(lessons[0].evidenceRefs).toContain("c1");
  });

  it("records a lesson when research yields no findings", () => {
    const lessons = extractLessonsFromResearch(
      researchResult([]),
      { taskId: "t3", source: "web-research" }
    );
    expect(lessons.length).toBe(1);
    expect(lessons[0].outcome).toBe("failure");
  });
});

describe("M4.5 – learning memory", () => {
  it("does not silently overwrite historical records", () => {
    const memory = new LearningMemory();
    const first = memory.add({
      taskId: "t1",
      context: "ctx",
      observation: "same observation",
      expectedOutcome: "expected",
      actualOutcome: "actual",
      outcome: "failure",
      lesson: "first attempt",
      confidence: 0.3,
      evidenceRefs: [],
      source: "test",
      applicability: "research",
      timestamp: NOW,
      memoryCategory: "episodic",
    });

    const second = memory.add({
      taskId: "t1",
      context: "ctx",
      observation: "same observation",
      expectedOutcome: "expected",
      actualOutcome: "actual",
      outcome: "success",
      lesson: "second attempt",
      confidence: 0.6,
      evidenceRefs: ["e1"],
      source: "test",
      applicability: "research",
      timestamp: NOW,
      memoryCategory: "episodic",
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(memory.get(first.id)?.status).toBe("superseded");
    expect(memory.get(first.id)?.lesson).toBe("first attempt");
    expect(memory.get(second.id)?.status).toBe("candidate");
    expect(memory.all().length).toBe(2);
  });

  it("stores records across the five learning statuses", () => {
    const memory = new LearningMemory();
    const record = memory.add({
      taskId: "t2",
      context: "",
      observation: "obs",
      expectedOutcome: "x",
      actualOutcome: "y",
      outcome: "failure",
      lesson: "lesson",
      confidence: 0.2,
      evidenceRefs: [],
      source: "test",
      applicability: "synthesis",
      timestamp: NOW,
    });
    expect(["candidate", "validated", "active", "rejected", "superseded"]).toContain(record.status);
  });

  it("exposes no delete capability", () => {
    const memory = new LearningMemory();
    const deleteMethod = (memory as unknown as { delete?: unknown }).delete;
    expect(deleteMethod).toBeUndefined();
  });

  it("enforces a bounded record store", () => {
    const memory = new LearningMemory({ maxRecords: 2 });
    for (let i = 0; i < 2; i++) {
      memory.add({
        taskId: `t${i}`,
        context: "",
        observation: `obs ${i}`,
        expectedOutcome: "x",
        actualOutcome: "y",
        outcome: "failure",
        lesson: `lesson ${i}`,
        confidence: 0.2,
        evidenceRefs: [],
        source: "test",
        applicability: "research",
        timestamp: NOW,
      });
    }
    expect(() =>
      memory.add({
        taskId: "t3",
        context: "",
        observation: "obs 3",
        expectedOutcome: "x",
        actualOutcome: "y",
        outcome: "failure",
        lesson: "lesson 3",
        confidence: 0.2,
        evidenceRefs: [],
        source: "test",
        applicability: "research",
        timestamp: NOW,
      })
    ).toThrow(/learning memory is full/);
  });
});

describe("M4.5 – memory retrieval", () => {
  function record(
    id: string,
    applicability: string,
    lesson: string,
    confidence: number,
    timestamp: string,
    status: LearningRecord["status"] = "candidate",
    evidenceRefs: string[] = []
  ): LearningRecord {
    return {
      id,
      timestamp,
      taskId: "t1",
      context: lesson,
      observation: lesson,
      expectedOutcome: "x",
      actualOutcome: "y",
      outcome: "partial",
      lesson,
      confidence,
      evidenceRefs,
      source: "test",
      applicability,
      version: 1,
      status,
      memoryCategory: "semantic",
    };
  }

  it("returns bounded, explainable, advisory results", () => {
    const memory = new LearningMemory({ initial: [
      record("r1", "synthesis", "keep evidence references on every claim", 0.8, "2026-01-20T00:00:00.000Z", "candidate", ["e1"]),
      record("r2", "web-research", "verify against three sources before synthesis", 0.7, "2026-01-10T00:00:00.000Z", "active", ["e2"]),
      record("r3", "ranking", "bias towards official sources", 0.5, "2026-01-05T00:00:00.000Z", "candidate", ["e3"]),
    ] });

    const results = retrieveLessons(memory.all(), { taskType: "synthesis", context: "synthesis claims references" }, {
      maxResults: 2,
      asOf: "2026-02-01T00:00:00.000Z",
    });

    expect(results.length).toBeLessThanOrEqual(2);
    expect(results[0].reasons.length).toBeGreaterThan(0);
    expect(results[0].advisory).toBe(true);
    expect(results[0].reasons.some((r) => r.includes("advisory"))).toBe(true);
  });

  it("scoring is deterministic for identical inputs", () => {
    const records = [record("r1", "synthesis", "lesson one", 0.8, "2026-01-20T00:00:00.000Z")];
    const options = { maxResults: 5, asOf: "2026-02-01T00:00:00.000Z" };
    const q = { taskType: "synthesis", context: "lesson" };
    expect(retrieveLessons(records.slice(), q, options)).toEqual(
      retrieveLessons(records.slice(), q, options)
    );
  });

  it("excludes rejected and superseded records", () => {
    const records = [
      record("r1", "synthesis", "active lesson", 0.8, "2026-01-20T00:00:00.000Z", "active", ["e1"]),
      record("r2", "synthesis", "rejected lesson", 0.9, "2026-01-20T00:00:00.000Z", "rejected", ["e2"]),
      record("r3", "synthesis", "superseded lesson", 0.9, "2026-01-20T00:00:00.000Z", "superseded", ["e3"]),
    ];
    const results = retrieveLessons(records, { taskType: "synthesis" }, { asOf: "2026-02-01T00:00:00.000Z", maxResults: 5 });
    expect(results.map((r) => r.record.id)).toEqual(["r1"]);
  });

  it("computes context similarity within bounds", () => {
    const sim = contextSimilarity("synthesis claims references", record("r1", "synthesis", "keep evidence references on every claim", 0.8, "2026-01-20T00:00:00.000Z"));
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
    expect(DEFAULT_WEIGHTS.context).toBeGreaterThan(0);
  });
});

describe("M4.5 – controlled evolution: static validation", () => {
  it("accepts a valid proposal", () => {
    const input = evaluationInput();
    const validation = staticValidationOf(input);
    expect(validation.passed).toBe(true);
    expect(validation.reasons.length).toBe(0);
  });

  it("rejects a proposal missing required fields", () => {
    const input = evaluationInput({ proposal: validProposal({ description: "" }) });
    const validation = staticValidationOf(input);
    expect(validation.passed).toBe(false);
    expect(validation.reasons).toContain("missing required field: description");
  });

  it("rejects a proposal with missing evidence references", () => {
    const input = evaluationInput({ proposal: validProposal({ evidenceRefs: [] }) });
    const validation = staticValidationOf(input);
    expect(validation.passed).toBe(false);
  });

  it("rejects evidence references that do not exist", () => {
    const input = evaluationInput({ proposal: validProposal({ evidenceRefs: ["ghost"] }) });
    const validation = staticValidationOf(input);
    expect(validation.passed).toBe(false);
  });

  it("rejects a proposal missing a rollback plan", () => {
    const input = evaluationInput({ proposal: validProposal({ rollbackPlan: "" }) });
    const validation = staticValidationOf(input);
    expect(validation.passed).toBe(false);
    expect(validation.reasons).toContain("rollback plan is required");
  });

  it("rejects confidence outside valid bounds", () => {
    const input = evaluationInput({ proposal: validProposal({ confidence: 1.5 }) });
    const validation = staticValidationOf(input);
    expect(validation.passed).toBe(false);
  });

  it("rejects production mutation, git, deployment, and security scopes", () => {
    const scopedProposals = [
      validProposal({ affectedComponent: "deploy to production cluster" }),
      validProposal({ affectedComponent: "git commit and push" }),
      validProposal({ affectedComponent: "source-file editor" }),
      validProposal({ affectedComponent: "disable tests" }),
      validProposal({ affectedComponent: "api-key rotation" }),
      validProposal({ affectedComponent: "authentication bypass" }),
    ];

    for (const proposal of scopedProposals) {
      const validation = staticValidationOf(evaluationInput({ proposal }));
      expect(validation.passed).toBe(false);
      expect(validation.reasons.join(" ")).toMatch(/prohibited scope/);
    }
  });
});

describe("M4.5 – controlled evolution: gates", () => {
  it("fails the sandbox gate when a test fails", () => {
    const report = validSandboxReport({
      tests: [
        {
          id: "t1",
          description: "deterministic fixture input",
          inputFingerprint: "fixture-a",
          baselineOutput: "",
          proposedOutput: "",
          passed: false,
        },
      ],
    });
    const gate = sandboxEvaluationOf(report);
    expect(gate.passed).toBe(false);
    expect(gate.reasons.some((r) => r.includes("t1 failed"))).toBe(true);

    const decision = evaluateProposal(evaluationInput({ sandboxReport: report }));
    expect(decision.recommendation).toBe("reject");
  });

  it("fails the sandbox gate when it touches security controls or secrets", () => {
    expect(sandboxEvaluationOf(validSandboxReport({ secretsAccessed: true })).passed).toBe(false);
    expect(sandboxEvaluationOf(validSandboxReport({ securityControlsTouched: true })).passed).toBe(false);
    expect(sandboxEvaluationOf(validSandboxReport({ isolated: false })).passed).toBe(false);
  });

  it("fails the regression check when protected behavior changes", () => {
    const report = validRegressionReport({
      checks: [
        { component: "rankStabilityHeuristic", behaviorFingerprint: "x", unchanged: false },
      ],
    });
    const gate = regressionEvaluationOf(validProposal(), report);
    expect(gate.passed).toBe(false);

    const decision = evaluateProposal(evaluationInput({ regressionReport: report }));
    expect(decision.recommendation).toBe("reject");
  });

  it("rejects proposals targeting protected M4.4 components", () => {
    const proposal = validProposal({ affectedComponent: "validateUrl" });
    const decision = evaluateProposal(evaluationInput({ proposal }));
    expect(decision.regressionPassed).toBe(false);
    expect(decision.recommendation).toBe("reject");
    expect(decision.reasons.join(" ")).toMatch(/protected M4\.4/);
  });

  it("rejects when no regression checks are supplied", () => {
    const decision = evaluateProposal(evaluationInput({ regressionReport: { checks: [] } }));
    expect(decision.regressionPassed).toBe(false);
    expect(decision.recommendation).toBe("reject");
  });
});

describe("M4.5 – controlled evolution: benefit and risk", () => {
  it("records measurable benefit improvement with metric and test count", () => {
    const report = benefitEvaluationOf({
      measureable: true,
      evaluationMetric: "accuracy",
      baselineScore: 0.5,
      proposedScore: 0.8,
      testCount: 12,
    });
    expect(report.baselineScore).toBe(0.5);
    expect(report.proposedScore).toBe(0.8);
    expect(report.improvement).toBe(0.3);
    expect(report.evaluationMetric).toBe("accuracy");
    expect(report.testCount).toBe(12);
  });

  it("does not invent benefit when no measurement exists", () => {
    const report = benefitEvaluationOf({
      measureable: false,
      evaluationMetric: "unknown",
      baselineScore: 0,
      proposedScore: 0,
      testCount: 0,
    });
    expect(report.benefitScore).toBe(0);
    expect(report.evaluationMetric).toBe("not_measureable");

    const decision = evaluateProposal(evaluationInput({
      benefitMeasurement: { measureable: false, evaluationMetric: "unknown", baselineScore: 0, proposedScore: 0, testCount: 0 },
    }));
    expect(decision.recommendation).toBe("reject");
    expect(decision.reasons.join(" ")).toMatch(/no measurable benefit/);
  });

  it("rejects when there is no measurable improvement", () => {
    const decision = evaluateProposal(evaluationInput({
      benefitMeasurement: { measureable: true, evaluationMetric: "accuracy", baselineScore: 0.8, proposedScore: 0.8, testCount: 5 },
    }));
    expect(decision.recommendation).toBe("reject");
  });

  it("never automatically approves a high-risk proposal", () => {
    const decision = evaluateProposal(evaluationInput({
      proposal: validProposal({ riskLevel: "high" }),
    }));
    expect(decision.recommendation).toBe("needs_review");
    expect(decision.riskLevel).toBe("high");
  });

  it("records risk level, affected component, security impact, and rollback availability", () => {
    const decision = evaluateProposal(evaluationInput({
      proposal: validProposal({
        riskLevel: "medium",
        securityImpact: "low",
        id: "p-risk",
      }),
    }));
    expect(decision.riskLevel).toBe("medium");
    expect(decision.rollbackAvailable).toBe(true);
  });
});

describe("M4.5 – controlled evolution: decisions", () => {
  it("recommends approve_for_human_review for a fully passing valid proposal", () => {
    const decision = evaluateProposal(evaluationInput());
    expect(decision.validationPassed).toBe(true);
    expect(decision.sandboxPassed).toBe(true);
    expect(decision.regressionPassed).toBe(true);
    expect(decision.recommendation).toBe("approve_for_human_review");
    expect(decision.status).toBe("approve_for_human_review");
    expect(decision.proposalId).toBe("p1");
    expect(decision.benefitScore).toBe(0.3);
  });

  it("returns only allowed statuses and never a production-approval status", () => {
    const statuses = new Set<string>();
    const scenarios = [
      evaluationInput(),
      evaluationInput({ proposal: validProposal({ rollbackPlan: "" }) }),
      evaluationInput({ proposal: validProposal({ riskLevel: "high" }) }),
    ];

    for (const input of scenarios) {
      const decision = evaluateProposal(input);
      statuses.add(decision.recommendation);
      expect(allowedRecommendations()).toContain(decision.recommendation);
      expect(["reject", "needs_review", "approve_for_human_review"]).toContain(decision.status);
      expect(decision.status).not.toBe("approved");
      expect(decision.status).not.toBe("activated");
    }

    expect(statuses.has("approve_for_human_review")).toBe(true);
  });

  it("rejects a rejected proposal with full reasons", () => {
    const decision = evaluateProposal(evaluationInput({
      proposal: validProposal({ evidenceRefs: [] }),
    }));
    expect(decision.recommendation).toBe("reject");
    expect(decision.status).toBe("reject");
    expect(decision.validationPassed).toBe(false);
    expect(decision.sandboxPassed).toBe(false);
    expect(decision.reasons.length).toBeGreaterThan(0);
  });
});

describe("M4.5 – human approval gate", () => {
  it("keeps evaluation separate from activation", () => {
    const decision = evaluateProposal(evaluationInput());
    expect(decision.recommendation).toBe("approve_for_human_review");

    const approval = approveForProduction("p1", "human-operator", decision, NOW);
    expect(approval.approved).toBe(true);
    expect(approval.status).toBe("approved");
    expect(approval.reason).toMatch(/separate external operation/);
  });

  it("denies activation when the evaluator did not recommend review", () => {
    const decision = evaluateProposal(evaluationInput({ proposal: validProposal({ riskLevel: "high" }) }));
    expect(decision.recommendation).toBe("needs_review");

    const approval = approveForProduction("p1", "human-operator", decision, NOW);
    expect(approval.approved).toBe(false);
    expect(approval.status).toBe("denied");
  });
});

describe("M4.5 – production mutation protection", () => {
  it("the evaluator does not mutate frozen evaluation inputs", () => {
    const input = evaluationInput();
    const frozenInput: EvaluationInput = Object.freeze({
      proposal: Object.freeze({ ...input.proposal, evidenceRefs: Object.freeze([...input.proposal.evidenceRefs]) }),
      evidenceRegistry: input.evidenceRegistry,
      sandboxReport: Object.freeze({
        ...input.sandboxReport,
        tests: Object.freeze(input.sandboxReport.tests.map((t) => Object.freeze({ ...t }))),
      }),
      regressionReport: Object.freeze({
        checks: Object.freeze(input.regressionReport.checks.map((c) => Object.freeze({ ...c }))),
      }),
      benefitMeasurement: Object.freeze({ ...input.benefitMeasurement }),
    });

    const snapshot = JSON.stringify(frozenInput);
    const decision = evaluateProposal(frozenInput);
    expect(JSON.stringify(frozenInput)).toBe(snapshot);
    expect(decision.recommendation).toBe("approve_for_human_review");
  });

  it("evaluation performs no git, deployment, or source operations", () => {
    const decision = evaluateProposal(evaluationInput());
    expect(decision.recommendation).toBe("approve_for_human_review");
    expect(decision.reasons.join(" ")).toMatch(/requires explicit human approval/);
    expect(decision.reasons.join(" ")).not.toMatch(/activation completed|deployed|committed/);
  });

  it("source-file and config mutations are rejected at the gate", () => {
    const inputs = [
      evaluationInput({ proposal: validProposal({ affectedComponent: "src/lib/learning/memory.ts" }) }),
      evaluationInput({ proposal: validProposal({ affectedComponent: "production configuration" }) }),
      evaluationInput({ proposal: validProposal({ affectedComponent: "delete memory records" }) }),
    ];

    for (const input of inputs) {
      const decision = evaluateProposal(input);
      expect(decision.validationPassed).toBe(false);
      expect(decision.recommendation).toBe("reject");
    }
  });
});

describe("M4.5 – determinism", () => {
  it("produces identical evaluation results for identical input", () => {
    const inputA = evaluationInput();
    const inputB = evaluationInput();

    const first = evaluateProposal(inputA);
    const second = evaluateProposal(inputB);

    expect(second).toEqual(first);
  });
});

describe("M4.5 – M4.4 regression behavior", () => {
  it("keeps M4.4 URL validation and ranking behavior intact", () => {
    expect(validateUrl("https://example.com/path").ok).toBe(true);
    expect(validateUrl("https://127.0.0.1/x").ok).toBe(false);

    const findings: RankedFinding[] = [
      {
        claim: {
          id: "c1",
          claim: "claim one",
          supportingQuote: "quote",
          confidence: 0.7,
          sourceUrl: "https://nextjs.org/docs",
          extractedAt: NOW,
        },
        verification: {
          claimId: "c1",
          status: "verified",
          supportingSources: ["https://nextjs.org/docs"],
          conflictingSources: [],
          confidence: 0.8,
        },
        trustLevel: "official",
        finalScore: 95,
        rank: 1,
      },
    ];
    const ranged = rangeResults(findings, { minScore: 0.5 });
    expect(ranged.length).toBe(1);
    expect(ranged[0].score).toBeGreaterThan(0);
  });
});

describe("M4.5 – decision result shape", () => {
  it("exposes all required decision fields", () => {
    const decision = evaluateProposal(evaluationInput());
    const required: Array<keyof EvaluationDecision> = [
      "proposalId",
      "status",
      "validationPassed",
      "sandboxPassed",
      "regressionPassed",
      "benefitScore",
      "riskLevel",
      "recommendation",
      "reasons",
      "rollbackAvailable",
    ];
    for (const field of required) {
      expect(decision[field]).toBeDefined();
    }
  });
});