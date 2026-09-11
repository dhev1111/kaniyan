/**
 * M5.5 – MemoryStore validation and typed errors.
 * Reuses M5.1 validation so "a valid memory" is always the same concept.
 */

import { MEMORY_LIMITS } from "../limits";
import { clamp } from "../util";
import { validateInput } from "../validation";
import type { MemoryReference } from "../types";
import type { MemoryListFilter, MemoryStoreErrorCode } from "./types";

export class MemoryStoreError extends Error {
  readonly code: MemoryStoreErrorCode;
  constructor(code: MemoryStoreErrorCode, message: string) {
    super(message);
    this.name = "MemoryStoreError";
    this.code = code;
  }
}

export function assertStoreId(id: unknown): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new MemoryStoreError("invalid-id", "memory id must be a non-empty string");
  }
  if (id.length > MEMORY_LIMITS.MAX_SOURCE_ID_CHARS) {
    throw new MemoryStoreError("invalid-id", "memory id exceeds the length bound");
  }
  return id;
}

export function assertStoreRecord(memory: unknown): asserts memory is MemoryReference {
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) {
    throw new MemoryStoreError("invalid-record", "memory must be an object");
  }
  const candidate = memory as Partial<MemoryReference>;
  if (typeof candidate.id !== "string" || candidate.id.trim() === "") {
    throw new MemoryStoreError("invalid-record", "memory id is required");
  }
  if (typeof candidate.content !== "string") {
    throw new MemoryStoreError("invalid-record", "memory content is required");
  }
  const report = validateInput({
    content: candidate.content,
    type: candidate.type,
    source: candidate.source as MemoryReference["source"],
    metadata: candidate.metadata as MemoryReference["metadata"],
    provenance: candidate.provenance as MemoryReference["provenance"],
    confidence: candidate.confidence,
    importance: candidate.importance,
    status: candidate.status,
    relationships: candidate.relationships as MemoryReference["relationships"],
  });
  if (!report.ok) {
    throw new MemoryStoreError(
      "invalid-record",
      `memory validation failed: ${report.issues.map((entry) => entry.message).join("; ")}`
    );
  }
}

export function clampStoreCapacity(capacity: number | undefined): number {
  const floor = Math.max(1, Math.floor(capacity ?? MEMORY_LIMITS.DEFAULT_MEMORY_STORE_CAPACITY));
  return clamp(floor, 1, MEMORY_LIMITS.MAX_MEMORY_STORE_CAPACITY);
}

export function matchesFilter(memory: MemoryReference, filter: MemoryListFilter): boolean {
  if (filter.projectId !== undefined && memory.metadata.projectId !== filter.projectId) return false;
  if (filter.memoryType !== undefined && memory.type !== filter.memoryType) return false;
  if (filter.status !== undefined && memory.status !== filter.status) return false;
  if (filter.scope !== undefined && memory.metadata.scope !== filter.scope) return false;
  if (filter.sourceKind !== undefined && memory.provenance.sourceKind !== filter.sourceKind) return false;
  if (filter.confidence !== undefined && memory.confidence !== filter.confidence) return false;
  if (filter.importance !== undefined && memory.importance !== filter.importance) return false;
  if (filter.tags !== undefined && filter.tags.length > 0) {
    const tagSet = new Set(filter.tags);
    const hasAny = memory.metadata.tags.some((tag) => tagSet.has(tag));
    if (!hasAny) return false;
  }
  return true;
}

export function compareMemoryRecords(a: MemoryReference, b: MemoryReference): number {
  if (a.createdAt !== b.createdAt) return b.createdAt > a.createdAt ? 1 : -1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function copyMemoryReference(memory: MemoryReference): MemoryReference {
  return {
    id: memory.id,
    content: memory.content,
    type: memory.type,
    source: { ...memory.source },
    metadata: {
      scope: memory.metadata.scope,
      projectId: memory.metadata.projectId,
      taskId: memory.metadata.taskId,
      sessionId: memory.metadata.sessionId,
      tags: memory.metadata.tags.slice(),
      language: memory.metadata.language,
      author: memory.metadata.author,
      extra: { ...memory.metadata.extra },
    },
    provenance: { ...memory.provenance },
    importance: memory.importance,
    confidence: memory.confidence,
    status: memory.status,
    contentHash: memory.contentHash,
    version: memory.version,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    lastAccessedAt: memory.lastAccessedAt,
    relationships: memory.relationships.map((entry) => ({ ...entry })),
    conflicts: memory.conflicts.map((entry) => ({
      conflictId: entry.conflictId,
      involvedMemoryIds: entry.involvedMemoryIds.slice(),
      state: entry.state,
      detectedAt: entry.detectedAt,
      resolutionNote: entry.resolutionNote,
    })),
  };
}