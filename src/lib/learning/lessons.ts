/**
 * M4.5 – Lesson Extraction
 * Extracts structured lessons from evaluations and research outcomes.
 */

import type { WebResearchResult } from "../research/web/types";
import type { LearningRecord } from "./types";
import { evaluateOutcome, type SelfEvaluationInput } from "./evaluate";
import { truncateText } from "./scoring";

export interface ReviewerNote {
  note: string;
  evidenceRef: string;
  confidence: number;
}

export interface LessonOptions {
  taskId: string;
  source?: string;
  applicability?: string;
  now?: string;
  reviewerNotes?: ReviewerNote[];
}

const MAX_LESSON_CHARS = 300;
const UNSUPPORTED_MAX_CONFIDENCE = 0.45;

export function calibrateConfidence(
  confidence: number,
  evidenceCount: number
): number {
  const cap =
    evidenceCount === 0
      ? UNSUPPORTED_MAX_CONFIDENCE
      : Math.min(0.9, UNSUPPORTED_MAX_CONFIDENCE + evidenceCount * 0.1);
  return Math.round(Math.min(confidence, cap) * 100) / 100;
}

export function extractLessonsFromEvaluation(
  input: SelfEvaluationInput,
  options: LessonOptions
): LearningRecord[] {
  const evaluation = evaluateOutcome(input);
  const taskId = options.taskId;
  const timestamp = options.now ?? new Date().toISOString();
  const source = options.source ?? "self-evaluation";
  const applicability = options.applicability ?? "";

  const evidenceRefs =
    options.reviewerNotes?.map((note) => note.evidenceRef) ?? [];

  const lessonStatus =
    evaluation.outcome === "success"
      ? "expected and actual outcomes matched"
      : evaluation.outcome === "failure"
        ? `plan failed: expected "${truncateText(input.expectedOutcome, MAX_LESSON_CHARS)}" but observed "${truncateText(input.actualOutcome, MAX_LESSON_CHARS)}"`
        : "outcome partially matched expectations";

  const lessons: LearningRecord[] = [
    {
      id: deterministicId(taskId, "evaluation", 1),
      timestamp,
      taskId,
      context: options.applicability ?? "",
      observation: truncateText(input.actualOutcome, MAX_LESSON_CHARS),
      expectedOutcome: input.expectedOutcome,
      actualOutcome: input.actualOutcome,
      outcome: evaluation.outcome,
      lesson: lessonStatus,
      confidence: calibrateConfidence(evaluation.overallScore, evidenceRefs.length),
      evidenceRefs,
      source,
      applicability,
      version: 1,
      status: "candidate",
      memoryCategory: "episodic",
    },
  ];

  if (options.reviewerNotes) {
    for (const note of options.reviewerNotes) {
      lessons.push({
        id: deterministicId(taskId, note.evidenceRef, 1),
        timestamp,
        taskId,
        context: "",
        observation: truncateText(note.note, MAX_LESSON_CHARS),
        expectedOutcome: "",
        actualOutcome: "",
        outcome: evaluation.outcome,
        lesson: truncateText(note.note, MAX_LESSON_CHARS),
        confidence: calibrateConfidence(note.confidence, 1),
        evidenceRefs: [note.evidenceRef],
        source: "reviewer",
        applicability: "",
        version: 1,
        status: "candidate",
        memoryCategory: "semantic",
      });
    }
  }

  return lessons;
}

export function extractLessonsFromResearch(
  result: WebResearchResult,
  options: LessonOptions
): LearningRecord[] {
  const taskId = options.taskId;
  const timestamp = options.now ?? new Date().toISOString();
  const source = options.source ?? "web-research";
  const applicability = options.applicability ?? "web-research";
  const lessons: LearningRecord[] = [];

  const findings = result.rankedFindings;

  if (findings.length === 0) {
    lessons.push({
      id: deterministicId(taskId, "no-evidence", 1),
      timestamp,
      taskId,
      context: result.query,
      observation: "no evidence",
      expectedOutcome: "verified findings",
      actualOutcome: "none",
      outcome: "failure",
      lesson: `Research for "${truncateText(result.query, MAX_LESSON_CHARS)}" produced no findings.`,
      confidence: calibrateConfidence(0.3, 0),
      evidenceRefs: [],
      source,
      applicability,
      version: 1,
      status: "candidate",
      memoryCategory: "episodic",
    });
    return lessons;
  }

  const conflicting = findings.filter(
    (finding) => finding.verification.status === "conflicting"
  );
  const unverified = findings.filter(
    (finding) => finding.verification.status === "unverified"
  );
  const successful = findings.filter(
    (finding) =>
      finding.verification.status === "verified" ||
      finding.verification.status === "supported"
  );

  for (const finding of conflicting) {
    const refs = [
      finding.claim.id,
      ...finding.verification.conflictingSources,
    ];
    lessons.push({
      id: deterministicId(taskId, finding.claim.id, 1),
      timestamp,
      taskId,
      context: result.query,
      observation: "conflicting evidence",
      expectedOutcome: "consistent evidence",
      actualOutcome: "conflicting evidence",
      outcome: "failure",
      lesson: `Evidence conflicts for claim ${finding.claim.id}.`,
      confidence: calibrateConfidence(0.35, refs.length),
      evidenceRefs: refs,
      source,
      applicability,
      version: 1,
      status: "candidate",
      memoryCategory: "semantic",
    });
  }

  if (unverified.length > 0) {
    lessons.push({
      id: deterministicId(taskId, "unverified-gap", 1),
      timestamp,
      taskId,
      context: result.query,
      observation: "incomplete verification",
      expectedOutcome: "verified claims",
      actualOutcome: "unverified claims",
      outcome: "partial",
      lesson: `${unverified.length} finding(s) remain unverified; verification coverage is incomplete.`,
      confidence: calibrateConfidence(0.3, unverified.length),
      evidenceRefs: unverified.map((finding) => finding.claim.id),
      source,
      applicability,
      version: 1,
      status: "candidate",
      memoryCategory: "semantic",
    });
  }

  if (result.warnings.length > 0) {
    lessons.push({
      id: deterministicId(taskId, "warnings", 1),
      timestamp,
      taskId,
      context: result.query,
      observation: "research warnings",
      expectedOutcome: "clean research run",
      actualOutcome: "warnings emitted",
      outcome: "partial",
      lesson: truncateText(`Research completed with warnings: ${result.warnings.join("; ")}`, MAX_LESSON_CHARS),
      confidence: calibrateConfidence(0.3, 0),
      evidenceRefs: [],
      source,
      applicability,
      version: 1,
      status: "candidate",
      memoryCategory: "semantic",
    });
  }

  if (
    successful.length > 0 &&
    conflicting.length === 0 &&
    unverified.length === 0
  ) {
    lessons.push({
      id: deterministicId(taskId, "success", 1),
      timestamp,
      taskId,
      context: result.query,
      observation: "verified findings",
      expectedOutcome: "verified findings",
      actualOutcome: "verified findings",
      outcome: "success",
      lesson: `Research produced ${successful.length} verified/supported finding(s) for "${truncateText(result.query, MAX_LESSON_CHARS)}".`,
      confidence: calibrateConfidence(0.4 + successful.length * 0.05, successful.length),
      evidenceRefs: successful.map((finding) => finding.claim.id),
      source,
      applicability,
      version: 1,
      status: "candidate",
      memoryCategory: "semantic",
    });
  }

  return lessons;
}

export function deterministicId(
  taskId: string,
  discriminator: string,
  version: number
): string {
  let hash = 5381;
  const inputString = `${taskId}|${discriminator}|${version}`;
  for (let i = 0; i < inputString.length; i++) {
    hash = (hash * 33) ^ inputString.charCodeAt(i);
  }
  return `rec-${(hash >>> 0).toString(36)}`;
}