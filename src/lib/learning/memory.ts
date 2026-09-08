/**
 * M4.5 – Learning Memory
 * Stores structured learning records without silently overwriting history.
 */

import type {
  LearningRecord,
  LearningRecordInput,
  LearningStatus,
  MemoryCategory,
} from "./types";

export interface MemoryFilter {
  taskId?: string;
  status?: LearningStatus;
  memoryCategory?: MemoryCategory;
  source?: string;
}

export class LearningMemory {
  private records: LearningRecord[] = [];
  private readonly maxRecords: number;

  constructor(options: { initial?: LearningRecord[]; maxRecords?: number } = {}) {
    this.maxRecords = Math.max(1, options.maxRecords ?? 1000);
    this.records = (options.initial ?? []).slice();
  }

  add(input: LearningRecordInput): LearningRecord {
    const prior = this.records.filter(
      (record) =>
        record.taskId === input.taskId &&
        record.observation === input.observation &&
        record.status !== "superseded" &&
        record.status !== "rejected"
    );

    const version = Math.max(1, ...prior.map((record) => record.version + 1));

    for (const record of prior) {
      this.records = this.records.map((candidate) =>
        candidate.id === record.id
          ? { ...candidate, status: "superseded" }
          : candidate
      );
    }

    const record: LearningRecord = {
      id: hashId(input.taskId, input.observation, version),
      timestamp: input.timestamp ?? new Date().toISOString(),
      taskId: input.taskId,
      context: input.context ?? "",
      observation: input.observation ?? "",
      expectedOutcome: input.expectedOutcome ?? "",
      actualOutcome: input.actualOutcome ?? "",
      outcome: input.outcome,
      lesson: input.lesson ?? "",
      confidence: input.confidence ?? 0,
      evidenceRefs: (input.evidenceRefs ?? []).slice(),
      source: input.source ?? "unknown",
      applicability: input.applicability ?? "",
      version,
      status: input.status ?? "candidate",
      memoryCategory: input.memoryCategory ?? "semantic",
    };

    this.records.push(record);
    this.enforceBound();

    return { ...record, evidenceRefs: record.evidenceRefs.slice() };
  }

  get(id: string): LearningRecord | undefined {
    const found = this.records.find((record) => record.id === id);
    if (!found) return undefined;
    return { ...found, evidenceRefs: found.evidenceRefs.slice() };
  }

  find(filter: MemoryFilter = {}): LearningRecord[] {
    return this.records
      .filter((record) => {
        if (filter.taskId !== undefined && record.taskId !== filter.taskId) {
          return false;
        }
        if (filter.status !== undefined && record.status !== filter.status) {
          return false;
        }
        if (
          filter.memoryCategory !== undefined &&
          record.memoryCategory !== filter.memoryCategory
        ) {
          return false;
        }
        if (filter.source !== undefined && record.source !== filter.source) {
          return false;
        }
        return true;
      })
      .map((record) => ({ ...record, evidenceRefs: record.evidenceRefs.slice() }))
      .sort(
        (a, b) =>
          b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id)
      );
  }

  all(): LearningRecord[] {
    return this.records.map((record) => ({
      ...record,
      evidenceRefs: record.evidenceRefs.slice(),
    }));
  }

  size(): number {
    return this.records.length;
  }

  private enforceBound(): void {
    if (this.records.length <= this.maxRecords) return;

    const evictable = this.records.filter(
      (record) => record.status === "superseded" || record.status === "rejected"
    );
    evictable.sort(
      (a, b) =>
        a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)
    );

    while (this.records.length > this.maxRecords && evictable.length > 0) {
      const candidate = evictable.shift();
      if (!candidate) break;
      this.records = this.records.filter(
        (record) => record.id !== candidate.id
      );
    }

    if (this.records.length > this.maxRecords) {
      throw new Error(
        `learning memory is full: ${this.records.length} active records exceed the ${this.maxRecords} record bound`
      );
    }
  }
}

export function hashId(taskId: string, observation: string, version: number): string {
  let hash = 2166136261;
  const inputString = `${taskId}|${observation}|${version}`;
  for (let i = 0; i < inputString.length; i++) {
    hash ^= inputString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mem-${(hash >>> 0).toString(36)}`;
}