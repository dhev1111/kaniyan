/**
 * M5 – Deterministic numeric, hashing and formatting helpers.
 * Persistence and retrieval must be reproducible, so nothing here may
 * depend on randomness or wall-clock time unless a value is injected.
 */

export const ZERO_HASH = "0";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

export function round6(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function truncateText(text: string, max = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 3))}...`;
}

/** FNV-1a 32-bit hash expressed as base-36 (deterministic, portable). */
export function fnv1a36(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Deterministic memory-style identifier, e.g. `mem-abc123`. */
export function memoryId(...parts: string[]): string {
  return `mem-${fnv1a36(parts.join("|"))}`;
}

export function normalizeText(text: string): string {
  let value = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
  value = value.replace(/\r\n?/g, "\n");
  value = value.replace(/[ \t]+\n/g, "\n");
  value = value.replace(/\n{3,}/g, "\n\n");
  value = value.replace(/[ \t]{2,}/g, " ");
  return value.trim();
}

export function isValidHttpUrl(value: string): boolean {
  if (value.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

export function nowIso(now?: string): string {
  return now ?? new Date().toISOString();
}

export function isIsoDate(value: string): boolean {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}