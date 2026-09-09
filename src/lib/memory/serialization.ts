/**
 * M5.1 – Canonical serialization for memory references.
 * JSON round-trips are deterministic, schema-versioned and size-bounded so
 * persisted memory can migrate forward without breaking older stores.
 */

import { MEMORY_LIMITS } from "./limits";
import { validateInput } from "./validation";
import { nowIso } from "./util";
import type {
  MemoryConfidence,
  MemoryConflict,
  MemoryImportance,
  MemoryMetadata,
  MemoryProvenance,
  MemoryReference,
  MemoryRelationship,
  MemoryScope,
  MemorySource,
  MemorySourceKind,
  MemoryStatus,
  MemoryType,
  RelationshipKind,
  ConflictState,
} from "./types";

export const MEMORY_SCHEMA_VERSION = "kaniyan/memory@1";

const MAX_SERIALIZED_CHARS = 4 * 1024 * 1024;

export interface MemoryDocument {
  schema: "kaniyan/memory@1";
  memory: MemoryReference;
}

function canonicalsorted(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalsorted(entry));
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const entries = Object.keys(source)
      .sort()
      .map((key) => [key, canonicalsorted(source[key])] as const);
    return entries.reduce<Record<string, unknown>>((accumulator, [key, entry]) => {
      accumulator[key] = entry;
      return accumulator;
    }, {});
  }
  return value;
}

export function serializeDocument(memory: MemoryReference): MemoryDocument {
  return {
    schema: "kaniyan/memory@1",
    memory: { ...memory },
  };
}

/** Deterministic, schema-versioned JSON representation. */
export function serializeMemoryJson(memory: MemoryReference): string {
  const document = serializeDocument(memory);
  const json = JSON.stringify(canonicalsorted(document));
  if (json.length > MAX_SERIALIZED_CHARS) {
    throw new Error(`serialized memory exceeds the ${MAX_SERIALIZED_CHARS} char bound`);
  }
  return json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readStringList(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function parseSource(value: unknown): MemorySource | undefined {
  if (!isRecord(value)) return undefined;
  const kind = readString(value, "kind");
  const url = readString(value, "url");
  const title = readString(value, "title");
  const id = readString(value, "id");
  if (!id || !kind) return undefined;
  return {
    id,
    kind: kind as MemorySourceKind,
    url,
    title,
  };
}

function parseMetadata(value: unknown): MemoryMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const scope = readString(value, "scope");
  if (!scope) return undefined;
  const extraValue = value["extra"];
  const extra: Record<string, string> = {};
  if (isRecord(extraValue)) {
    for (const key of Object.keys(extraValue)) {
      const entry = extraValue[key];
      if (typeof entry === "string") extra[key] = entry;
    }
  }
  return {
    scope: scope as MemoryScope,
    projectId: readString(value, "projectId"),
    taskId: readString(value, "taskId"),
    sessionId: readString(value, "sessionId"),
    tags: readStringList(value, "tags"),
    language: readString(value, "language"),
    author: readString(value, "author"),
    extra,
  };
}

function parseProvenance(value: unknown): MemoryProvenance | undefined {
  if (!isRecord(value)) return undefined;
  const sourceKind = readString(value, "sourceKind");
  const ingestedAt = readString(value, "ingestedAt");
  if (!sourceKind || !ingestedAt) return undefined;
  return {
    sourceKind: sourceKind as MemorySourceKind,
    sourceId: readString(value, "sourceId"),
    sourceUrl: readString(value, "sourceUrl"),
    origin: readString(value, "origin"),
    evidence: readString(value, "evidence"),
    ingestedAt,
  };
}

function parseRelationships(value: unknown): MemoryRelationship[] {
  if (!Array.isArray(value)) return [];
  const relationships: MemoryRelationship[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const targetId = readString(entry, "targetId");
    const kind = readString(entry, "kind");
    if (!targetId || !kind) continue;
    const strength = typeof entry["strength"] === "number" ? entry["strength"] : undefined;
    relationships.push({
      targetId,
      kind: kind as RelationshipKind,
      strength,
      note: readString(entry, "note"),
    });
  }
  return relationships;
}

function parseConflicts(value: unknown): MemoryConflict[] {
  if (!Array.isArray(value)) return [];
  const conflicts: MemoryConflict[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const conflictId = readString(entry, "conflictId");
    if (!conflictId) continue;
    const involved = readStringList(entry, "involvedMemoryIds");
    const state = readString(entry, "state");
    conflicts.push({
      conflictId,
      involvedMemoryIds: involved,
      state: (state === "resolved" || state === "superseded" ? state : "unresolved") as ConflictState,
      detectedAt: readString(entry, "detectedAt") ?? nowIso(),
      resolutionNote: readString(entry, "resolutionNote"),
    });
  }
  return conflicts;
}

function parseMemory(value: unknown): MemoryReference | undefined {
  if (!isRecord(value)) return undefined;
  const id = readString(value, "id");
  const content = readString(value, "content");
  const type = readString(value, "type");
  const status = readString(value, "status");
  const confidence = readString(value, "confidence");
  const importance = readString(value, "importance");
  const contentHash = readString(value, "contentHash") ?? "";
  const version = typeof value["version"] === "number" ? value["version"] : 1;
  const createdAt = readString(value, "createdAt") ?? nowIso();
  const updatedAt = readString(value, "updatedAt") ?? createdAt;
  const lastAccessedAt = readString(value, "lastAccessedAt");
  if (!id || !content || !type || !status || !confidence || !importance) {
    return undefined;
  }
  const source = parseSource(value["source"]);
  const metadata = parseMetadata(value["metadata"]);
  const provenance = parseProvenance(value["provenance"]);
  if (!source || !metadata || !provenance) return undefined;
  return {
    id,
    content,
    type: type as MemoryType,
    source,
    metadata,
    provenance,
    importance: importance as MemoryImportance,
    confidence: confidence as MemoryConfidence,
    status: status as MemoryStatus,
    contentHash,
    version: Number.isInteger(version) && version >= 1 ? version : 1,
    createdAt,
    updatedAt,
    lastAccessedAt,
    relationships: parseRelationships(value["relationships"]),
    conflicts: parseConflicts(value["conflicts"]),
  };
}

/**
 * Parses a memory document from canonical JSON. Throws when the payload is
 * not object-shaped, exceeds the size bound, or fails model validation.
 */
export function parseMemoryJson(json: string): MemoryReference {
  if (typeof json !== "string") {
    throw new Error("memory serialization must be a string");
  }
  if (json.length > MAX_SERIALIZED_CHARS) {
    throw new Error(`serialized memory exceeds the ${MAX_SERIALIZED_CHARS} char bound`);
  }
  let record: unknown;
  try {
    record = JSON.parse(json);
  } catch {
    throw new Error("memory serialization is not valid JSON");
  }
  if (!isRecord(record)) {
    throw new Error("memory serialization must be an object");
  }
  if (record["schema"] !== "kaniyan/memory@1") {
    throw new Error(`unsupported memory schema: ${String(record["schema"])}`);
  }
  const memory = parseMemory(record["memory"]);
  if (!memory) {
    throw new Error("memory document is missing required fields");
  }
  const report = validateInput({
    content: memory.content,
    type: memory.type,
    source: memory.source,
    metadata: memory.metadata,
    provenance: memory.provenance,
    confidence: memory.confidence,
    importance: memory.importance,
    status: memory.status,
    relationships: memory.relationships,
  });
  if (!report.ok) {
    throw new Error(
      `stored memory failed validation: ${report.issues.map((entry) => entry.message).join("; ")}`
    );
  }
  return memory;
}

/** Strict round-trip helper: serialize then parse, used by tests and stores. */
export function roundTripMemory(memory: MemoryReference): MemoryReference {
  return parseMemoryJson(serializeMemoryJson(memory));
}

export interface SerializationMigration {
  from: string;
  to: string;
  transform: (document: MemoryDocument) => MemoryDocument;
}

/** Registry of forward migrations; empty while the schema is at v1. */
export const SERIALIZATION_MIGRATIONS: SerializationMigration[] = [];

function limitToBounds(memory: MemoryReference): MemoryReference {
  return memory;
}