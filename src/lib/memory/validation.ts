/**
 * M5.1 – Memory model validation and safe construction.
 * All validation is total and deterministic: invalid inputs produce a
 * bounded list of issues, never exceptions from deep in the call stack.
 */

import { MEMORY_LIMITS } from "./limits";
import {
  fnv1a36,
  memoryId,
  normalizeText,
  isValidHttpUrl,
  isIsoDate,
  nowIso,
} from "./util";
import type {
  MemoryConfidence,
  MemoryImportance,
  MemoryInput,
  MemoryMetadata,
  MemoryProvenance,
  MemoryQuery,
  MemoryReference,
  MemoryScope,
  MemorySource,
  MemorySourceKind,
  MemoryStatus,
  MemoryType,
  RelationshipKind,
} from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
}

const MEMORY_TYPES: readonly MemoryType[] = [
  "working",
  "episodic",
  "semantic",
  "procedural",
  "project",
];

const SOURCE_KINDS: readonly MemorySourceKind[] = [
  "web",
  "github",
  "research",
  "synthesis",
  "document",
  "text",
  "user",
  "system",
  "lesson",
  "project-artifact",
  "unknown",
];

const CONFIDENCES: readonly MemoryConfidence[] = ["low", "medium", "high"];

const IMPORTANCES: readonly MemoryImportance[] = [
  "low",
  "medium",
  "high",
  "critical",
];

const STATUSES: readonly MemoryStatus[] = [
  "candidate",
  "validated",
  "stored",
  "retrievable",
  "archived",
  "rejected",
  "superseded",
];

const SCOPES: readonly MemoryScope[] = ["global", "project", "task", "session"];

const RELATIONSHIP_KINDS: readonly RelationshipKind[] = [
  "derived_from",
  "related",
  "supports",
  "contradicts",
  "supersedes",
  "referenced_by",
  "part_of",
];

function issue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

export function isMemoryType(value: string): boolean {
  return (MEMORY_TYPES as readonly string[]).includes(value);
}

export function isMemorySourceKind(value: string): boolean {
  return (SOURCE_KINDS as readonly string[]).includes(value);
}

export function isMemoryStatus(value: string): boolean {
  return (STATUSES as readonly string[]).includes(value);
}

export function isMemoryConfidence(value: string): boolean {
  return (CONFIDENCES as readonly string[]).includes(value);
}

export function isMemoryImportance(value: string): boolean {
  return (IMPORTANCES as readonly string[]).includes(value);
}

export function isMemoryScope(value: string): boolean {
  return (SCOPES as readonly string[]).includes(value);
}

export function isRelationshipKind(value: string): boolean {
  return (RELATIONSHIP_KINDS as readonly string[]).includes(value);
}

function validateSource(
  issues: ValidationIssue[],
  source: MemorySource | undefined
): string {
  if (!source) return ".";
  if (typeof source.id !== "string" || source.id.trim() === "") {
    issue(issues, "source.id", "source id is required");
  } else if (source.id.length > MEMORY_LIMITS.MAX_SOURCE_ID_CHARS) {
    issue(issues, "source.id", "source id exceeds the length bound");
  }
  if (!isMemorySourceKind(source.kind)) {
    issue(issues, "source.kind", `unknown source kind: ${String(source.kind)}`);
  }
  if (source.title !== undefined && source.title.length > MEMORY_LIMITS.MAX_TITLE_CHARS) {
    issue(issues, "source.title", "source title exceeds the length bound");
  }
  if (source.url !== undefined && !isValidHttpUrl(source.url)) {
    issue(issues, "source.url", "source url must be a valid http(s) url");
  }
  return ".";
}

function validateProvenance(
  issues: ValidationIssue[],
  provenance: MemoryProvenance | undefined
): string {
  if (!provenance) {
    issue(issues, "provenance", "provenance is required");
    return ".";
  }
  if (!isMemorySourceKind(provenance.sourceKind)) {
    issue(
      issues,
      "provenance.sourceKind",
      `unknown source kind: ${String(provenance.sourceKind)}`
    );
  }
  if (
    provenance.sourceId !== undefined &&
    provenance.sourceId.length > MEMORY_LIMITS.MAX_SOURCE_ID_CHARS
  ) {
    issue(issues, "provenance.sourceId", "source id exceeds the length bound");
  }
  if (provenance.sourceUrl !== undefined && !isValidHttpUrl(provenance.sourceUrl)) {
    issue(issues, "provenance.sourceUrl", "source url must be a valid http(s) url");
  }
  if (
    provenance.origin !== undefined &&
    provenance.origin.length > MEMORY_LIMITS.MAX_ORIGIN_CHARS
  ) {
    issue(issues, "provenance.origin", "origin exceeds the length bound");
  }
  if (
    provenance.evidence !== undefined &&
    provenance.evidence.length > MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS
  ) {
    issue(issues, "provenance.evidence", "evidence exceeds the length bound");
  }
  if (!isIsoDate(provenance.ingestedAt)) {
    issue(issues, "provenance.ingestedAt", "ingestedAt must be an ISO date");
  }
  return ".";
}

function validateMetadata(
  issues: ValidationIssue[],
  metadata: MemoryInput["metadata"]
): string {
  if (!metadata) return ".";
  if (!isMemoryScope(metadata.scope)) {
    issue(issues, "metadata.scope", `unknown scope: ${String(metadata.scope)}`);
  }
  if (metadata.scope === "project" && !metadata.projectId) {
    issue(issues, "metadata.projectId", "project scope requires a projectId");
  }
  if (metadata.scope === "task" && !metadata.taskId) {
    issue(issues, "metadata.taskId", "task scope requires a taskId");
  }
  if (metadata.scope === "session" && !metadata.sessionId) {
    issue(issues, "metadata.sessionId", "session scope requires a sessionId");
  }
  if (!Array.isArray(metadata.tags)) {
    issue(issues, "metadata.tags", "tags must be an array");
  } else if (metadata.tags.length > MEMORY_LIMITS.MAX_TAGS_PER_MEMORY) {
    issue(issues, "metadata.tags", "tags exceed the count bound");
  } else {
    metadata.tags.forEach((tag, index) => {
      if (typeof tag !== "string" || tag.trim() === "") {
        issue(issues, `metadata.tags[${index}]`, "tag must be a non-empty string");
      } else if (tag.length > MEMORY_LIMITS.MAX_TAG_CHARS) {
        issue(issues, `metadata.tags[${index}]`, "tag exceeds the length bound");
      }
    });
  }
  if (metadata.extra === undefined || typeof metadata.extra !== "object") {
    issue(issues, "metadata.extra", "extra must be an object of string values");
  } else {
    const keys = Object.keys(metadata.extra);
    if (keys.length > MEMORY_LIMITS.MAX_EXTRA_METADATA_KEYS) {
      issue(issues, "metadata.extra", "extra exceeds the key count bound");
    }
    for (const key of keys) {
      if (key.length > MEMORY_LIMITS.MAX_EXTRA_METADATA_KEY_CHARS) {
        issue(issues, `metadata.extra.${key}`, "extra key exceeds the length bound");
      }
      if (
        typeof metadata.extra[key] !== "string" ||
        metadata.extra[key].length > MEMORY_LIMITS.MAX_EXTRA_METADATA_VALUE_CHARS
      ) {
        issue(
          issues,
          `metadata.extra.${key}`,
          "extra value must be a string within the length bound"
        );
      }
    }
  }
  return ".";
}

function validateRelationships(
  issues: ValidationIssue[],
  relationships: MemoryInput["relationships"]
): string {
  if (!relationships) return ".";
  if (relationships.length > MEMORY_LIMITS.MAX_RELATIONSHIPS_PER_MEMORY) {
    issue(issues, "relationships", "relationships exceed the count bound");
  }
  relationships.forEach((relationship, index) => {
    const path = `relationships[${index}]`;
    if (
      typeof relationship.targetId !== "string" ||
      !relationship.targetId.startsWith("mem-")
    ) {
      issue(issues, `${path}.targetId`, "targetId must be a memory id");
    }
    if (!isRelationshipKind(relationship.kind)) {
      issue(issues, `${path}.kind`, `unknown relationship kind: ${String(relationship.kind)}`);
    }
    if (relationship.strength !== undefined) {
      if (typeof relationship.strength !== "number") {
        issue(issues, `${path}.strength`, "strength must be a number");
      } else if (relationship.strength < 0 || relationship.strength > 1) {
        issue(issues, `${path}.strength`, "strength must be within 0..1");
      }
    }
    if (
      relationship.note !== undefined &&
      relationship.note.length > MEMORY_LIMITS.MAX_REASON_CHARS
    ) {
      issue(issues, `${path}.note`, "note exceeds the length bound");
    }
  });
  return ".";
}

export function validateInput(input: MemoryInput): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!input || typeof input !== "object") {
    issue(issues, "input", "input must be an object");
    return { ok: false, issues };
  }
  if (typeof input.content !== "string") {
    issue(issues, "content", "content must be a string");
    return { ok: false, issues };
  }
  const normalized = normalizeText(input.content);
  if (normalized.length < MEMORY_LIMITS.MIN_MEMORY_CONTENT_CHARS) {
    issue(issues, "content", "content must not be empty");
  } else if (normalized.length > MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS) {
    issue(issues, "content", "content exceeds the length bound");
  }
  if (input.type !== undefined && !isMemoryType(input.type)) {
    issue(issues, "type", `unknown memory type: ${String(input.type)}`);
  }
  if (input.confidence !== undefined && !isMemoryConfidence(input.confidence)) {
    issue(issues, "confidence", `unknown confidence: ${String(input.confidence)}`);
  }
  if (input.importance !== undefined && !isMemoryImportance(input.importance)) {
    issue(issues, "importance", `unknown importance: ${String(input.importance)}`);
  }
  if (input.status !== undefined && !isMemoryStatus(input.status)) {
    issue(issues, "status", `unknown status: ${String(input.status)}`);
  }
  validateSource(issues, input.source);
  validateProvenance(issues, input.provenance);
  validateMetadata(issues, input.metadata);
  validateRelationships(issues, input.relationships);
  return { ok: issues.length === 0, issues };
}

export function validateQuery(query: MemoryQuery): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!query || typeof query !== "object") {
    issue(issues, "query", "query must be an object");
    return { ok: false, issues };
  }
  if (query.text !== undefined && typeof query.text !== "string") {
    issue(issues, "text", "text must be a string");
  }
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit)) {
      issue(issues, "limit", "limit must be an integer");
    } else if (query.limit < 1 || query.limit > MEMORY_LIMITS.MAX_MEMORY_PAGE_SIZE) {
      issue(issues, "limit", `limit must be within 1..${MEMORY_LIMITS.MAX_MEMORY_PAGE_SIZE}`);
    }
  }
  (["memoryTypes", "scopes", "statuses", "confidence", "sourceKinds"] as const).forEach(
    (field) => {
      const values = query[field];
      if (values === undefined) return;
      if (!Array.isArray(values)) {
        issue(issues, field, `${field} must be an array`);
        return;
      }
      for (const value of values) {
        if (field === "memoryTypes" && !isMemoryType(value)) {
          issue(issues, `${field}`, `unknown memory type: ${String(value)}`);
        } else if (field === "scopes" && !isMemoryScope(value)) {
          issue(issues, field, `unknown scope: ${String(value)}`);
        } else if (field === "statuses" && !isMemoryStatus(value)) {
          issue(issues, field, `unknown status: ${String(value)}`);
        } else if (field === "confidence" && !isMemoryConfidence(value)) {
          issue(issues, field, `unknown confidence: ${String(value)}`);
        } else if (field === "sourceKinds" && !isMemorySourceKind(value)) {
          issue(issues, field, `unknown source kind: ${String(value)}`);
        }
      }
    }
  );
  (["projectIds", "taskIds", "sessionIds", "tags"] as const).forEach((field) => {
    const values = query[field];
    if (values === undefined) return;
    if (!Array.isArray(values)) {
      issue(issues, field, `${field} must be an array`);
      return;
    }
    for (const value of values) {
      if (typeof value !== "string" || value.trim() === "") {
        issue(issues, field, `${field} entries must be non-empty strings`);
      }
    }
  });
  if (query.minImportance !== undefined && !isMemoryImportance(query.minImportance)) {
    issue(issues, "minImportance", `unknown importance: ${String(query.minImportance)}`);
  }
  for (const field of ["notBefore", "notAfter"] as const) {
    const value = query[field];
    if (value !== undefined && !isIsoDate(value)) {
      issue(issues, field, `${field} must be an ISO date`);
    }
  }
  if (query.includeArchived !== undefined && typeof query.includeArchived !== "boolean") {
    issue(issues, "includeArchived", "includeArchived must be a boolean");
  }
  return { ok: issues.length === 0, issues };
}

function defaultSource(provenance: MemoryProvenance, now: string): MemorySource {
  return {
    id: memoryId(`inline-source`, provenance.sourceKind, now),
    kind: provenance.sourceKind,
    title: provenance.origin ?? undefined,
    url: provenance.sourceUrl,
  };
}

function defaultMetadata(now: string): MemoryMetadata {
  return { scope: "global", tags: [], extra: {} };
}

/**
 * Builds a fully-populated, validated MemoryReference.
 * Throws a deterministic MemoryValidationError when the input is invalid
 * so callers never persist malformed memory.
 */
export function constructMemory(
  input: MemoryInput,
  options: { now?: string; id?: string; version?: number } = {}
): MemoryReference {
  const report = validateInput(input);
  if (!report.ok) {
    throw new MemoryValidationError(report.issues);
  }
  const now = nowIso(options.now);
  const content = normalizeText(input.content);
  const version = options.version ?? 1;
  const provenance: MemoryProvenance = input.provenance;
  const source = input.source ?? defaultSource(provenance, now);
  const metadata = input.metadata ?? defaultMetadata(now);
  const contentHash = fnv1a36(content);
  const id = options.id ?? memoryId(contentHash, provenance.ingestedAt, provenance.sourceKind ?? "text", now);
  return {
    id,
    content,
    type: input.type ?? "semantic",
    source: { ...source, url: source.url ?? undefined, title: source.title ?? undefined },
    metadata: {
      ...metadata,
      tags: metadata.tags.slice(),
      extra: { ...metadata.extra },
    },
    provenance: { ...provenance },
    importance: input.importance ?? "medium",
    confidence: input.confidence ?? "medium",
    status: input.status ?? "candidate",
    contentHash,
    version,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: undefined,
    relationships: (input.relationships ?? []).map((relationship) => ({ ...relationship })),
    conflicts: [],
  };
}

export class MemoryValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(`memory validation failed: ${issues.map((entry) => entry.message).join("; ")}`);
    this.name = "MemoryValidationError";
    this.issues = issues.slice();
  }
}

const IMPORTANCE_ORDER: readonly MemoryImportance[] = ["low", "medium", "high", "critical"];

export function importanceIndex(importance: MemoryImportance): number {
  return IMPORTANCE_ORDER.indexOf(importance);
}

export function isAtLeastImportance(
  importance: MemoryImportance,
  minimum: MemoryImportance
): boolean {
  return importanceIndex(importance) >= importanceIndex(minimum);
}

function severityValue(confidence: MemoryConfidence): number {
  if (confidence === "high") return 1;
  if (confidence === "medium") return 0.5;
  return 0.25;
}

/** Deterministic numeric confidence used by scoring and consolidation. */
export function confidenceScore(confidence: MemoryConfidence): number {
  return severityValue(confidence);
}