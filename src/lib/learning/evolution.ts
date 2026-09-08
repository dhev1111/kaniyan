/**
 * M4.5 – Controlled Evolution Evaluator
 * Evaluates improvement proposals without ever mutating production.
 */

import { clampScore, round3, truncateText } from "./scoring";

export type ProposalCategory =
  | "research"
  | "synthesis"
  | "learning"
  | "retrieval"
  | "ranking"
  | "workflow";

export type RiskLevel = "low" | "medium" | "high";

export type SecurityImpact = "none" | "low" | "medium" | "high";

export type Recommendation =
  | "reject"
  | "needs_review"
  | "approve_for_human_review";

export type ProposalStatus =
  | "candidate"
  | "reject"
  | "needs_review"
  | "approve_for_human_review"
  | "approved"
  | "denied";

export interface ImprovementProposal {
  id: string;
  title: string;
  category: ProposalCategory;
  affectedComponent: string;
  description: string;
  evidenceRefs: readonly string[];
  confidence: number;
  riskLevel: RiskLevel;
  securityImpact: SecurityImpact;
  rollbackPlan: string;
}

export interface SandboxTest {
  id: string;
  description: string;
  inputFingerprint: string;
  baselineOutput: string;
  proposedOutput: string;
  passed: boolean;
}

export interface SandboxGateReport {
  isolated: boolean;
  secretsAccessed: boolean;
  securityControlsTouched: boolean;
  tests: readonly SandboxTest[];
}

export interface RegressionCheck {
  component: string;
  behaviorFingerprint: string;
  unchanged: boolean;
}

export interface RegressionReport {
  checks: readonly RegressionCheck[];
}

export interface BenefitMeasurement {
  measureable: boolean;
  evaluationMetric: string;
  baselineScore: number;
  proposedScore: number;
  testCount: number;
}

export interface EvaluationInput {
  proposal: ImprovementProposal;
  evidenceRegistry: ReadonlySet<string>;
  sandboxReport: SandboxGateReport;
  regressionReport: RegressionReport;
  benefitMeasurement: BenefitMeasurement;
}

export interface EvaluationDecision {
  proposalId: string;
  status: Recommendation;
  validationPassed: boolean;
  sandboxPassed: boolean;
  regressionPassed: boolean;
  benefitScore: number;
  riskLevel: RiskLevel;
  recommendation: Recommendation;
  reasons: string[];
  rollbackAvailable: boolean;
}

export interface BenefitReport {
  baselineScore: number;
  proposedScore: number;
  improvement: number;
  benefitScore: number;
  evaluationMetric: string;
  testCount: number;
}

export interface HumanApprovalRecord {
  proposalId: string;
  status: "approved" | "denied";
  approved: boolean;
  approvedBy: string;
  timestamp: string;
  previousDecision: Recommendation;
  reason: string;
}

export const PROPOSAL_CATEGORIES: readonly ProposalCategory[] = [
  "research",
  "synthesis",
  "learning",
  "retrieval",
  "ranking",
  "workflow",
];

export const RISK_LEVELS: readonly RiskLevel[] = ["low", "medium", "high"];

export const SECURITY_IMPACTS: readonly SecurityImpact[] = [
  "none",
  "low",
  "medium",
  "high",
];

export const PROTECTED_AREAS: readonly string[] = [
  "validateurl",
  "validatewebquery",
  "validateresponsesize",
  "validateredirectcount",
  "websresearchservice",
  "researchservice",
  "runwebresearch",
  "searchwithconfiguredprovider",
  "ssrf",
  "url-restrictions",
  "evidence-traceability",
  "deterministic",
  "web-research",
];

export const PROHIBITED_SCOPES: readonly string[] = [
  "deploy",
  "deployment",
  "git-commit",
  "git-push",
  "git",
  "source-mutation",
  "source-file",
  "source",
  "src/lib",
  "src-lib",
  ".ts",
  ".tsx",
  "write",
  "modify",
  "mutat",
  "secret",
  "secrets",
  "api-key",
  "test-disablement",
  "disable-tests",
  "disable tests",
  "config-mutation",
  "config",
  "configuration",
  "memory-deletion",
  "memory-delete",
  "delete",
  "authentication",
  "authorization",
  "auth",
];

const ALLOWED_STATUSES: readonly Recommendation[] = [
  "reject",
  "needs_review",
  "approve_for_human_review",
];

export function evaluateProposal(input: EvaluationInput): EvaluationDecision {
  const validation = staticValidationOf(input);
  const sandbox = sandboxEvaluationOf(input.sandboxReport);
  const regression = regressionEvaluationOf(input.proposal, input.regressionReport);
  const benefit = benefitEvaluationOf(input.benefitMeasurement);

  const validationPassed = validation.passed;
  const sandboxPassed = validationPassed && sandbox.passed;
  const regressionPassed = sandboxPassed && regression.passed;

  let recommendation: Recommendation;
  const reasons: string[] = [];

  if (!validationPassed) {
    recommendation = "reject";
    reasons.push(...validation.reasons);
    reasons.push("static validation rejected the proposal");
  } else if (!sandbox.passed) {
    recommendation = "reject";
    reasons.push(...sandbox.reasons);
    reasons.push("sandbox evaluation rejected the proposal");
  } else if (!regression.passed) {
    recommendation = "reject";
    reasons.push(...regression.reasons);
    reasons.push("regression check rejected the proposal");
  } else if (benefit.improvement <= 0) {
    recommendation = "reject";
    reasons.push(
      `no measurable benefit improvement (${benefit.improvement} on ${benefit.evaluationMetric})`
    );
    reasons.push("benefit evaluation rejected the proposal");
  } else if (input.proposal.riskLevel === "high") {
    recommendation = "needs_review";
    reasons.push("high-risk proposal requires human review before any activation");
  } else {
    recommendation = "approve_for_human_review";
    reasons.push(
      "all gates passed; production activation still requires explicit human approval"
    );
  }

  return {
    proposalId: input.proposal.id,
    status: recommendation,
    validationPassed,
    sandboxPassed,
    regressionPassed,
    benefitScore: benefit.benefitScore,
    riskLevel: input.proposal.riskLevel,
    recommendation,
    reasons: reasons.slice(),
    rollbackAvailable: input.proposal.rollbackPlan.trim().length > 0,
  };
}

export function approveForProduction(
  proposalId: string,
  approvedBy: string,
  previousDecision: EvaluationDecision,
  now: string = new Date().toISOString()
): HumanApprovalRecord {
  if (previousDecision.recommendation !== "approve_for_human_review") {
    return {
      proposalId,
      status: "denied",
      approved: false,
      approvedBy,
      timestamp: now,
      previousDecision: previousDecision.recommendation,
      reason:
        "production activation denied: the evaluator did not recommend human review",
    };
  }

  return {
    proposalId,
    status: "approved",
    approved: true,
    approvedBy,
    timestamp: now,
    previousDecision: previousDecision.recommendation,
    reason: "explicit human approval recorded; activation is a separate external operation",
  };
}

export function staticValidationOf(input: EvaluationInput): {
  passed: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const proposal = input.proposal;

  if (!isNonEmpty(proposal.id)) reasons.push("missing required field: id");
  if (!isNonEmpty(proposal.title)) reasons.push("missing required field: title");
  if (!isNonEmpty(proposal.affectedComponent)) {
    reasons.push("missing required field: affectedComponent");
  }
  if (!isNonEmpty(proposal.description)) {
    reasons.push("missing required field: description");
  }
  if (!PROPOSAL_CATEGORIES.includes(proposal.category)) {
    reasons.push(`unknown proposal category: ${proposal.category}`);
  }
  if (!isNonEmptyRollback(proposal.rollbackPlan)) {
    reasons.push("rollback plan is required");
  }
  if (
    !isValidEvidenceRefs(proposal.evidenceRefs, input.evidenceRegistry)
  ) {
    reasons.push(
      "evidence references are required and must exist in the registry"
    );
  }
  if (!isValidConfidence(proposal.confidence)) {
    reasons.push(`confidence ${proposal.confidence} is outside the valid bounds [0, 1]`);
  }
  if (!RISK_LEVELS.includes(proposal.riskLevel)) {
    reasons.push(`risk is not classified (${proposal.riskLevel})`);
  }
  if (!SECURITY_IMPACTS.includes(proposal.securityImpact)) {
    reasons.push(`security impact is not classified (${proposal.securityImpact})`);
  }

  const prohibited = prohibitedScopeFor(proposal.affectedComponent);
  if (prohibited !== undefined) {
    reasons.push(`proposal targets prohibited scope: ${prohibited}`);
  }

  return { passed: reasons.length === 0, reasons: reasons.slice() };
}

export function sandboxEvaluationOf(report: SandboxGateReport): {
  passed: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (!report.isolated) {
    reasons.push("sandbox was not isolated from production");
  }
  if (report.secretsAccessed) {
    reasons.push("sandbox accessed secrets");
  }
  if (report.securityControlsTouched) {
    reasons.push("sandbox modified security controls");
  }
  if (report.tests.length === 0) {
    reasons.push("sandbox executed no deterministic test inputs");
  }

  for (const test of report.tests) {
    if (!test.passed) {
      reasons.push(`sandbox test ${test.id} failed: ${truncateText(test.description)}`);
    }
  }

  const passed =
    report.isolated &&
    !report.secretsAccessed &&
    !report.securityControlsTouched &&
    report.tests.length > 0 &&
    report.tests.every((test) => test.passed);

  return { passed, reasons: reasons.slice() };
}

export function regressionEvaluationOf(
  proposal: ImprovementProposal,
  report: RegressionReport
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const protectedComponent = protectedAreaFor(proposal.affectedComponent);
  if (protectedComponent !== undefined) {
    reasons.push(
      `affected component "${proposal.affectedComponent}" is protected M4.4 territory (${protectedComponent}); changing it would regress existing behavior`
    );
  }

  if (report.checks.length === 0) {
    reasons.push("no regression checks were supplied");
  }

  for (const check of report.checks) {
    if (!check.unchanged) {
      reasons.push(
        `regression check ${check.component}: behavior changed in a protected area`
      );
    }
  }

  const passed =
    protectedComponent === undefined &&
    report.checks.length > 0 &&
    report.checks.every((check) => check.unchanged);

  return { passed, reasons: reasons.slice() };
}

export function benefitEvaluationOf(
  measurement: BenefitMeasurement
): BenefitReport & { improvement: number } {
  if (!measurement.measureable) {
    return {
      baselineScore: 0,
      proposedScore: 0,
      improvement: 0,
      benefitScore: 0,
      evaluationMetric: "not_measureable",
      testCount: 0,
    };
  }

  const baseline = clampScore(measurement.baselineScore);
  const proposed = clampScore(measurement.proposedScore);
  const improvement = round3(proposed - baseline);

  return {
    baselineScore: baseline,
    proposedScore: proposed,
    improvement,
    benefitScore: improvement,
    evaluationMetric: measurement.evaluationMetric,
    testCount: Math.max(0, Math.floor(measurement.testCount)),
  };
}

export function isNonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function isNonEmptyRollback(value: string): boolean {
  return isNonEmpty(value);
}

export function isValidEvidenceRefs(
  refs: readonly string[],
  registry: ReadonlySet<string>
): boolean {
  return Array.isArray(refs) && refs.length > 0 && refs.every((ref) => registry.has(ref));
}

export function isValidConfidence(value: number): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

export function prohibitedScopeFor(component: string): string | undefined {
  const needle = component.toLowerCase();
  for (const scope of PROHIBITED_SCOPES) {
    if (needle.includes(scope) || scope.includes(needle.trim())) {
      return scope;
    }
  }
  return undefined;
}

export function protectedAreaFor(component: string): string | undefined {
  const trimmed = component.toLowerCase().replace(/[^a-z0-9-]/g, "");
  for (const area of PROTECTED_AREAS) {
    if (trimmed.includes(area) || area.includes(trimmed)) {
      return area;
    }
  }
  return undefined;
}

export function allowedRecommendations(): readonly Recommendation[] {
  return ALLOWED_STATUSES.slice();
}