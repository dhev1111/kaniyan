/**
 * M5.9 – Deterministic query normalization.
 * Trims whitespace, collapses repeated whitespace, enforces
 * maximum length, and produces a bounded NormalizedQuery.
 * No LLM, no network, no mutation.
 */

import { MEMORY_LIMITS } from "../limits";
import { normalizeText } from "../util";
import type { NormalizedQuery, RecallErrorCode } from "./types";

export type QueryNormalizationResult =
  | { ok: true; normalized: NormalizedQuery }
  | { ok: false; code: RecallErrorCode; message: string };

const MAX_QUERY_LENGTH = MEMORY_LIMITS.MAX_RECALL_QUERY_LENGTH;

export function normalizeQuery(raw: unknown): QueryNormalizationResult {
  if (typeof raw !== "string") {
    return { ok: false, code: "invalid-query", message: "query must be a string" };
  }

  const originalLength = raw.length;

  if (originalLength > MAX_QUERY_LENGTH) {
    return {
      ok: false,
      code: "query-too-long",
      message: `query exceeds ${MAX_QUERY_LENGTH} characters`,
    };
  }

  const normalized = normalizeText(raw);

  if (normalized.length === 0) {
    return { ok: false, code: "empty-query", message: "query is empty after normalization" };
  }

  return {
    ok: true,
    normalized: {
      text: normalized,
      originalLength,
      normalizedLength: normalized.length,
    },
  };
}

export function isValidRecallInput(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    return typeof candidate.text === "string" && candidate.text.trim().length > 0;
  }
  return false;
}
