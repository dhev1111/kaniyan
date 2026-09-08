/**
 * M4.5 – Deterministic Memory Retrieval
 * Bounded, explainable retrieval of lessons for future tasks.
 */

import type { LearningRecord } from "./types";
import { textTokens } from "./evaluate";
import { clampScore, round6, round3 } from "./scoring";

export interface RetrievalQuery {
  taskType?: string;
  context?: string;
}

export interface RetrievalWeights {
  taskType: number;
  context: number;
  confidence: number;
  recency: number;
  applicability: number;
  evidence: number;
}

export interface RetrievedLesson {
  record: LearningRecord;
  score: number;
  reasons: string[];
  advisory: boolean;
}

export interface RetrievalOptions {
  maxResults?: number;
  asOf?: string;
  weights?: Partial<RetrievalWeights>;
}

export const DEFAULT_WEIGHTS: RetrievalWeights = {
  taskType: 0.3,
  context: 0.25,
  confidence: 0.15,
  recency: 0.1,
  applicability: 0.1,
  evidence: 0.1,
};

const ONE_DAY_MS = 86_400_000;

export function contextSimilarity(queryContext: string, record: LearningRecord): number {
  if (!queryContext.trim()) return 0.5;
  const merged = `${record.context} ${record.observation} ${record.lesson}`;
  const tokensA = new Set(textTokens(queryContext));
  const tokensB = new Set(textTokens(merged));

  const union = new Set([...tokensA, ...tokensB]);
  if (union.size === 0) return 1;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  return clampScore(intersection / union.size);
}

export function taskTypeMatch(taskType: string | undefined, record: LearningRecord): number {
  if (!taskType || !taskType.trim()) return 0.5;
  const query = taskType.trim().toLowerCase();
  const applicability = record.applicability.toLowerCase();
  if (applicability.includes(query)) return 1;
  return 0;
}

export function applicabilityScore(taskType: string | undefined, record: LearningRecord): number {
  if (!taskType || !taskType.trim()) return 0.5;
  const query = taskType.trim().toLowerCase();
  const applicability = record.applicability.toLowerCase();
  if (!applicability) return 0.5;
  return applicability.includes(query) ? 1 : 0.25;
}

export function recencyScore(timestamp: string, asOf: string): number {
  const recorded = Date.parse(timestamp);
  const reference = Date.parse(asOf);
  if (!Number.isFinite(recorded) || !Number.isFinite(reference)) return 0;

  const ageMs = Math.max(0, reference - recorded);
  const ageDays = ageMs / ONE_DAY_MS;
  return clampScore(1 / (1 + ageDays));
}

export function evidenceStrength(record: LearningRecord): number {
  return clampScore(record.evidenceRefs.length * 0.25);
}

export function scoreRecord(
  record: LearningRecord,
  query: RetrievalQuery,
  weights: RetrievalWeights,
  asOf: string
): RetrievedLesson {
  const scores: Array<[string, number]> = [
    ["task type", weights.taskType * taskTypeMatch(query.taskType, record)],
    ["context similarity", weights.context * contextSimilarity(query.context ?? "", record)],
    ["confidence", weights.confidence * clampScore(record.confidence)],
    ["recency", weights.recency * recencyScore(record.timestamp, asOf)],
    ["applicability", weights.applicability * applicabilityScore(query.taskType, record)],
    ["evidence strength", weights.evidence * evidenceStrength(record)],
  ];

  const score = round6(scores.reduce((sum, entry) => sum + entry[1], 0));

  const reasons = scores
    .filter((entry) => entry[1] > 0)
    .map((entry) => `${entry[0]} (${round3(entry[1])})`);

  if (reasons.length === 0) {
    reasons.push("no scoring dimension contributed");
  }

  reasons.push("retrieved lesson is advisory evidence, never applied blindly");

  return { record, score, reasons, advisory: true };
}

export function retrieveLessons(
  records: LearningRecord[],
  query: RetrievalQuery,
  options: RetrievalOptions = {}
): RetrievedLesson[] {
  const maxResults = Math.max(1, Math.floor(options.maxResults ?? 5));
  const asOf = options.asOf ?? new Date().toISOString();
  const weights: RetrievalWeights = { ...DEFAULT_WEIGHTS, ...options.weights };

  const scored = records
    .filter((record) => record.status !== "rejected" && record.status !== "superseded")
    .map((record) => scoreRecord(record, query, weights, asOf));

  scored.sort(
    (a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id)
  );

  return scored.slice(0, maxResults);
}