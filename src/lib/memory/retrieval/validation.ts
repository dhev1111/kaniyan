/**
 * M5.4 – Retrieval request/filter validation and typed errors.
 * Reuses the embedding and vector validators so retrieval never re-defines
 * "a valid vector" differently from the index that stores them.
 */

import { MEMORY_LIMITS } from "../limits";
import { validateEmbeddingVector } from "../embedding/validation";
import type { RetrievalErrorCode, RetrievalFilter, RetrievalRequest } from "./types";

export interface RetrievalIssue {
  path: string;
  message: string;
}

export interface RetrievalReport {
  ok: boolean;
  issues: RetrievalIssue[];
}

export class RetrievalValidationError extends Error {
  readonly code: RetrievalErrorCode;
  readonly issues: RetrievalIssue[];
  constructor(code: RetrievalErrorCode, issues: RetrievalIssue[]) {
    super(issues.map((entry) => `${entry.path}: ${entry.message}`).join("; "));
    this.name = "RetrievalValidationError";
    this.code = code;
    this.issues = issues.slice();
  }
}

function issue(issues: RetrievalIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value);
}

const SCOPES = ["global", "project", "task", "session"] as const;

export function validateRetrievalFilter(filter: unknown): RetrievalReport {
  const issues: RetrievalIssue[] = [];
  if (filter === undefined) return { ok: true, issues };
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    return { ok: false, issues: [{ path: "filter", message: "filter must be an object" }] };
  }
  const candidate = filter as RetrievalFilter;

  for (const field of ["ids", "tags", "projectIds"] as const) {
    const values = candidate[field];
    if (values === undefined) continue;
    if (!isStringArray(values)) {
      issue(issues, `filter.${field}`, `${field} must be an array of strings`);
      continue;
    }
    if (values.length > MEMORY_LIMITS.MAX_RETRIEVAL_FILTER_ENTRIES) {
      issue(issues, `filter.${field}`, `${field} exceeds the filter entry bound`);
    }
    for (const value of values) {
      if (typeof value !== "string" || value.trim() === "") {
        issue(issues, `filter.${field}`, `${field} entries must be non-empty strings`);
      }
    }
  }

  const scopes = (candidate as Record<string, unknown> & { scopes?: unknown }).scopes;
  if (scopes !== undefined) {
    if (!Array.isArray(scopes)) {
      issue(issues, "filter.scopes", "scopes must be an array");
    } else if (scopes.length > MEMORY_LIMITS.MAX_RETRIEVAL_FILTER_ENTRIES) {
      issue(issues, "filter.scopes", "scopes exceeds the filter entry bound");
    } else if (scopes.some((scope) => !(SCOPES as readonly unknown[]).includes(scope))) {
      issue(issues, "filter.scopes", `unknown scope in scopes: ${String(scopes)}`);
    }
  }

  const sourceKinds = (candidate as Record<string, unknown> & { sourceKinds?: unknown }).sourceKinds;
  if (sourceKinds !== undefined) {
    if (!Array.isArray(sourceKinds)) {
      issue(issues, "filter.sourceKinds", "sourceKinds must be an array");
    } else if (sourceKinds.length > MEMORY_LIMITS.MAX_RETRIEVAL_FILTER_ENTRIES) {
      issue(issues, "filter.sourceKinds", "sourceKinds exceeds the filter entry bound");
    } else if (sourceKinds.some((kind) => typeof kind !== "string" || kind.trim() === "")) {
      issue(issues, "filter.sourceKinds", "sourceKinds entries must be non-empty strings");
    }
  }

  const metadata = candidate.metadata;
  if (metadata !== undefined) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      issue(issues, "filter.metadata", "metadata must be an object of string values");
    } else {
      const keys = Object.keys(metadata);
      if (keys.length > MEMORY_LIMITS.MAX_VECTOR_METADATA_KEYS) {
        issue(issues, "filter.metadata", "metadata exceeds the key count bound");
      }
      for (const key of keys) {
        if (key.length > MEMORY_LIMITS.MAX_VECTOR_METADATA_KEY_CHARS) {
          issue(issues, `filter.metadata.${key}`, "metadata key exceeds the length bound");
        }
        const value = metadata[key];
        if (typeof value !== "string" || value.length > MEMORY_LIMITS.MAX_VECTOR_METADATA_VALUE_CHARS) {
          issue(issues, `filter.metadata.${key}`, "metadata value must be a string within bounds");
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function validateRetrievalRequest(request: unknown): RetrievalReport {
  const issues: RetrievalIssue[] = [];
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { ok: false, issues: [{ path: "request", message: "request must be an object" }] };
  }
  const candidate = request as RetrievalRequest;

  const hasVector = candidate.vector !== undefined;
  const hasText = candidate.text !== undefined;
  if (!hasVector && !hasText) {
    issue(issues, "vector", "request must provide either a vector or query text");
  }
  if (hasVector && hasText) {
    issue(issues, "query", "provide either a vector or query text, not both");
  }
  if (candidate.vector !== undefined) {
    const vectorReport = validateEmbeddingVector(candidate.vector);
    if (!vectorReport.ok) {
      for (const entry of vectorReport.issues) {
        issues.push({ path: `vector.${entry.path}`, message: entry.message });
      }
    }
  }
  if (candidate.text !== undefined) {
    if (typeof candidate.text !== "string" || candidate.text.trim() === "") {
      issue(issues, "text", "text must be a non-empty string");
    } else if (candidate.text.length > MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS) {
      issue(issues, "text", "text exceeds the char bound");
    }
  }
  if (candidate.topK !== undefined) {
    if (!Number.isInteger(candidate.topK)) {
      issue(issues, "topK", "topK must be an integer");
    } else if (candidate.topK < 1) {
      issue(issues, "topK", "topK must be at least 1");
    } else if (candidate.topK > MEMORY_LIMITS.MAX_VECTOR_SEARCH_TOP_K) {
      issue(issues, "topK", `topK exceeds the ${MEMORY_LIMITS.MAX_VECTOR_SEARCH_TOP_K} bound`);
    }
  }
  if (candidate.minSimilarity !== undefined) {
    if (typeof candidate.minSimilarity !== "number" || !Number.isFinite(candidate.minSimilarity)) {
      issue(issues, "minSimilarity", "minSimilarity must be a finite number");
    } else if (candidate.minSimilarity < 0 || candidate.minSimilarity > 1) {
      issue(issues, "minSimilarity", "minSimilarity must be within 0..1");
    }
  }
  const filterReport = validateRetrievalFilter(candidate.filter);
  if (!filterReport.ok) {
    issues.push(...filterReport.issues);
  }
  return { ok: issues.length === 0, issues };
}

export function assertRetrievalRequest(request: RetrievalRequest): RetrievalRequest {
  const report = validateRetrievalRequest(request);
  if (!report.ok) {
    throw new RetrievalValidationError("invalid-query", report.issues);
  }
  return request;
}

/** Re-export the shared bound helper used by retrieval and later milestones. */
export function retrievalLimits(): Readonly<typeof MEMORY_LIMITS> {
  return MEMORY_LIMITS;
}