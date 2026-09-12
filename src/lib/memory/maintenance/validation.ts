/**
 * M5.7 – Memory record validation.
 * Validates existing MemoryReference records against structural and
 * semantic constraints. Returns structured diagnostics, never throws.
 */

import { MEMORY_LIMITS } from "../limits";
import {
  isMemoryType,
  isMemoryStatus,
  isMemoryConfidence,
  isMemoryImportance,
  isMemorySourceKind,
  isMemoryScope,
  isRelationshipKind,
} from "../validation";
import { isIsoDate } from "../util";
import { fnv1a36, normalizeText } from "../util";
import { makeDiagnostic, type Diagnostic } from "./diagnostics";
import { DIAGNOSTIC_CODES } from "./diagnostics";
import type { MemoryReference } from "../types";

function isValidMemId(id: string): boolean {
  return typeof id === "string" && id.length >= 4 && id.startsWith("mem-");
}

function validateMemoryStructure(memory: MemoryReference): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const id = memory.id;

  if (memory === null || memory === undefined || typeof memory !== "object") {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_RECORD,
      "error",
      "memory record is not a valid object",
      id
    ));
    return diagnostics;
  }

  if (!isValidMemId(id)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_ID,
      "error",
      `invalid memory id format: ${String(id)}`,
      id
    ));
  }

  if (typeof memory.content !== "string") {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_MISSING_FIELD,
      "error",
      "content is missing or not a string",
      id
    ));
  } else {
    const normalized = normalizeText(memory.content);
    if (normalized.length < MEMORY_LIMITS.MIN_MEMORY_CONTENT_CHARS) {
      diagnostics.push(makeDiagnostic(
        DIAGNOSTIC_CODES.MEMORY_CONTENT_LIMIT,
        "error",
        "content is empty",
        id
      ));
    } else if (normalized.length > MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS) {
      diagnostics.push(makeDiagnostic(
        DIAGNOSTIC_CODES.MEMORY_CONTENT_LIMIT,
        "error",
        `content exceeds ${MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS} chars`,
        id
      ));
    }
  }

  if (!isMemoryType(memory.type)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_TYPE,
      "error",
      `invalid memory type: ${String(memory.type)}`,
      id
    ));
  }

  if (!isMemoryStatus(memory.status)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_STATUS,
      "error",
      `invalid memory status: ${String(memory.status)}`,
      id
    ));
  }

  if (!isMemoryConfidence(memory.confidence)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_CONFIDENCE,
      "error",
      `invalid confidence: ${String(memory.confidence)}`,
      id
    ));
  }

  if (!isMemoryImportance(memory.importance)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_IMPORTANCE,
      "error",
      `invalid importance: ${String(memory.importance)}`,
      id
    ));
  }

  return diagnostics;
}

function validateTimestamps(memory: MemoryReference): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const id = memory.id;

  if (!isIsoDate(memory.createdAt)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_TIMESTAMP,
      "error",
      `createdAt is not a valid ISO date: ${String(memory.createdAt)}`,
      id
    ));
  }
  if (!isIsoDate(memory.updatedAt)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_TIMESTAMP,
      "error",
      `updatedAt is not a valid ISO date: ${String(memory.updatedAt)}`,
      id
    ));
  }
  if (memory.lastAccessedAt !== undefined && !isIsoDate(memory.lastAccessedAt)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_TIMESTAMP,
      "warning",
      `lastAccessedAt is not a valid ISO date: ${String(memory.lastAccessedAt)}`,
      id
    ));
  }
  if (memory.expiresAt !== undefined && !isIsoDate(memory.expiresAt)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_TIMESTAMP,
      "warning",
      `expiresAt is not a valid ISO date: ${String(memory.expiresAt)}`,
      id
    ));
  }

  if (
    isIsoDate(memory.createdAt) &&
    isIsoDate(memory.updatedAt) &&
    memory.updatedAt < memory.createdAt
  ) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_IMPOSSIBLE_TIMESTAMPS,
      "error",
      "updatedAt precedes createdAt",
      id
    ));
  }

  if (
    memory.lastAccessedAt !== undefined &&
    isIsoDate(memory.lastAccessedAt) &&
    isIsoDate(memory.createdAt) &&
    memory.lastAccessedAt < memory.createdAt
  ) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_IMPOSSIBLE_TIMESTAMPS,
      "warning",
      "lastAccessedAt precedes createdAt",
      id
    ));
  }

  if (
    memory.expiresAt !== undefined &&
    isIsoDate(memory.expiresAt) &&
    isIsoDate(memory.createdAt) &&
    memory.expiresAt <= memory.createdAt
  ) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_IMPOSSIBLE_TIMESTAMPS,
      "warning",
      "expiresAt is not after createdAt",
      id
    ));
  }

  return diagnostics;
}

function validateMetadata(memory: MemoryReference): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const id = memory.id;
  const meta = memory.metadata;

  if (!meta || typeof meta !== "object") {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_METADATA_LIMIT,
      "error",
      "metadata is missing or not an object",
      id
    ));
    return diagnostics;
  }

  if (!isMemoryScope(meta.scope)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_METADATA_LIMIT,
      "error",
      `invalid metadata scope: ${String(meta.scope)}`,
      id
    ));
  }

  if (!Array.isArray(meta.tags)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_METADATA_LIMIT,
      "error",
      "metadata.tags is not an array",
      id
    ));
  } else if (meta.tags.length > MEMORY_LIMITS.MAX_TAGS_PER_MEMORY) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_METADATA_LIMIT,
      "warning",
      `tags exceed ${MEMORY_LIMITS.MAX_TAGS_PER_MEMORY} limit`,
      id
    ));
  }

  if (meta.extra !== undefined && typeof meta.extra === "object") {
    const keys = Object.keys(meta.extra);
    if (keys.length > MEMORY_LIMITS.MAX_EXTRA_METADATA_KEYS) {
      diagnostics.push(makeDiagnostic(
        DIAGNOSTIC_CODES.MEMORY_METADATA_LIMIT,
        "warning",
        `extra keys exceed ${MEMORY_LIMITS.MAX_EXTRA_METADATA_KEYS} limit`,
        id
      ));
    }
  }

  return diagnostics;
}

function validateProvenance(memory: MemoryReference): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const id = memory.id;
  const prov = memory.provenance;

  if (!prov || typeof prov !== "object") {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_PROVENANCE_INVALID,
      "error",
      "provenance is missing",
      id
    ));
    return diagnostics;
  }

  if (!isMemorySourceKind(prov.sourceKind)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_PROVENANCE_INVALID,
      "error",
      `invalid provenance sourceKind: ${String(prov.sourceKind)}`,
      id
    ));
  }

  if (!isIsoDate(prov.ingestedAt)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_PROVENANCE_INVALID,
      "error",
      `provenance.ingestedAt is not a valid ISO date: ${String(prov.ingestedAt)}`,
      id
    ));
  }

  return diagnostics;
}

function validateSource(memory: MemoryReference): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const id = memory.id;
  const src = memory.source;

  if (!src || typeof src !== "object") {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_MISSING_FIELD,
      "error",
      "source is missing",
      id
    ));
    return diagnostics;
  }

  if (typeof src.id !== "string" || src.id.trim() === "") {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_MISSING_FIELD,
      "error",
      "source.id is missing or empty",
      id
    ));
  }

  if (!isMemorySourceKind(src.kind)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_TYPE,
      "error",
      `invalid source kind: ${String(src.kind)}`,
      id
    ));
  }

  return diagnostics;
}

function validateRelationships(memory: MemoryReference): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const id = memory.id;

  if (!Array.isArray(memory.relationships)) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_METADATA_LIMIT,
      "warning",
      "relationships is not an array",
      id
    ));
    return diagnostics;
  }

  if (memory.relationships.length > MEMORY_LIMITS.MAX_RELATIONSHIPS_PER_MEMORY) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_METADATA_LIMIT,
      "warning",
      `relationships exceed ${MEMORY_LIMITS.MAX_RELATIONSHIPS_PER_MEMORY} limit`,
      id
    ));
  }

  for (let i = 0; i < memory.relationships.length; i++) {
    const rel = memory.relationships[i];
    if (!rel.targetId || !rel.targetId.startsWith("mem-")) {
      diagnostics.push(makeDiagnostic(
        DIAGNOSTIC_CODES.MEMORY_INVALID_RECORD,
        "warning",
        `relationships[${i}].targetId is invalid`,
        id
      ));
    }
    if (!isRelationshipKind(rel.kind)) {
      diagnostics.push(makeDiagnostic(
        DIAGNOSTIC_CODES.MEMORY_INVALID_RECORD,
        "warning",
        `relationships[${i}].kind is invalid`,
        id
      ));
    }
  }

  return diagnostics;
}

function validateContentHash(memory: MemoryReference): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const id = memory.id;

  if (typeof memory.content !== "string") return diagnostics;
  if (typeof memory.contentHash !== "string") {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_CONTENT_HASH_MISMATCH,
      "warning",
      "contentHash is not a string",
      id
    ));
    return diagnostics;
  }

  const expected = fnv1a36(normalizeText(memory.content));
  if (memory.contentHash !== expected) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_CONTENT_HASH_MISMATCH,
      "warning",
      "contentHash does not match content",
      id
    ));
  }

  return diagnostics;
}

function validateVersion(memory: MemoryReference): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const id = memory.id;

  if (typeof memory.version !== "number" || !Number.isInteger(memory.version) || memory.version < 1) {
    diagnostics.push(makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_RECORD,
      "error",
      `invalid version: ${String(memory.version)}`,
      id
    ));
  }

  return diagnostics;
}

export function validateMemoryRecord(memory: MemoryReference): Diagnostic[] {
  if (!memory || typeof memory !== "object") {
    return [makeDiagnostic(
      DIAGNOSTIC_CODES.MEMORY_INVALID_RECORD,
      "error",
      "memory is not a valid object"
    )];
  }

  return [
    ...validateMemoryStructure(memory),
    ...validateTimestamps(memory),
    ...validateMetadata(memory),
    ...validateProvenance(memory),
    ...validateSource(memory),
    ...validateRelationships(memory),
    ...validateContentHash(memory),
    ...validateVersion(memory),
  ];
}
