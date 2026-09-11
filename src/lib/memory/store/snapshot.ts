/**
 * M5.5 – Snapshot creation and atomic restore.
 * Uses M5.1 schema-versioned serialization: each persisted record is
 * validated, schema-checked and reconstructed through the canonical
 * parser so no untrusted object shape can enter the store.
 */

import { MEMORY_LIMITS } from "../limits";
import { parseMemoryJson, serializeMemoryJson, MEMORY_SCHEMA_VERSION } from "../serialization";
import { nowIso } from "../util";
import type { MemoryReference } from "../types";
import type { MemoryStore } from "./store";
import type { MemorySnapshot, RestoreResult } from "./types";

export function createSnapshot(store: MemoryStore): MemorySnapshot {
  const memories = store.list();
  const entries = memories.map((memory) => {
    const json = serializeMemoryJson(memory);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(`failed to serialize memory ${memory.id}`);
    }
    return parsed as { schema: string; memory: Record<string, unknown> };
  });
  if (entries.length > MEMORY_LIMITS.MAX_SNAPSHOT_RECORDS) {
    throw new Error(
      `snapshot exceeds the ${MEMORY_LIMITS.MAX_SNAPSHOT_RECORDS} record bound`
    );
  }
  return {
    version: MEMORY_SCHEMA_VERSION,
    entries,
    createdAt: nowIso(),
  };
}

/**
 * Validates each snapshot entry through the canonical parser, then commits
 * all validated memories atomically. If any entry is invalid, the store
 * remains unchanged and errors are returned.
 */
export function restoreSnapshot(snapshot: MemorySnapshot, store: MemoryStore): RestoreResult {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("snapshot must be an object");
  }
  if (snapshot.version !== MEMORY_SCHEMA_VERSION) {
    throw new Error(`unsupported snapshot version: ${String(snapshot.version)}`);
  }
  if (!Array.isArray(snapshot.entries)) {
    throw new Error("snapshot entries must be an array");
  }
  if (snapshot.entries.length > MEMORY_LIMITS.MAX_SNAPSHOT_RECORDS) {
    throw new Error(
      `snapshot exceeds the ${MEMORY_LIMITS.MAX_SNAPSHOT_RECORDS} record bound`
    );
  }

  const serialized = JSON.stringify(snapshot);
  if (serialized.length > MEMORY_LIMITS.MAX_SNAPSHOT_BYTES) {
    throw new Error(
      `snapshot exceeds the ${MEMORY_LIMITS.MAX_SNAPSHOT_BYTES} byte bound`
    );
  }

  const validated: MemoryReference[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < snapshot.entries.length; index += 1) {
    const entry = snapshot.entries[index];
    try {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`entry ${index}: must be an object`);
        continue;
      }
      if (entry.schema !== MEMORY_SCHEMA_VERSION) {
        errors.push(`entry ${index}: unsupported schema ${String(entry.schema)}`);
        continue;
      }
      const json = JSON.stringify(entry);
      const memory = parseMemoryJson(json);
      if (seenIds.has(memory.id)) {
        errors.push(`entry ${index}: duplicate id "${memory.id}"`);
        continue;
      }
      seenIds.add(memory.id);
      validated.push(memory);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`entry ${index}: ${message}`);
    }
  }

  if (errors.length > 0) {
    return { restored: 0, skipped: snapshot.entries.length, errors };
  }

  for (const memory of validated) {
    store.upsert(memory);
  }

  return { restored: validated.length, skipped: 0, errors: [] };
}

export function validateSnapshotPayload(payload: unknown): payload is MemorySnapshot {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const candidate = payload as Record<string, unknown>;
  if (candidate["version"] !== MEMORY_SCHEMA_VERSION) return false;
  if (!Array.isArray(candidate["entries"])) return false;
  return true;
}

export function safeParseSnapshot(json: string): { ok: true; snapshot: MemorySnapshot } | { ok: false; error: string } {
  if (typeof json !== "string") {
    return { ok: false, error: "snapshot must be a JSON string" };
  }
  if (json.length > MEMORY_LIMITS.MAX_SNAPSHOT_BYTES) {
    return { ok: false, error: "snapshot exceeds the byte bound" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "snapshot is not valid JSON" };
  }
  if (!validateSnapshotPayload(parsed)) {
    return { ok: false, error: "snapshot has invalid shape" };
  }
  return { ok: true, snapshot: parsed };
}