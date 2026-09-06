import { parsePositiveInt } from "../github/validation";
import type {
  AIModelAccess,
  AIModelCategory,
  AIModelSource,
  AIModelSourceKind,
  DiscoveryKind,
  ModelCost,
} from "./types";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const MODEL_CATEGORIES = [
  "foundation",
  "coding",
  "reasoning",
  "agent",
  "embedding",
  "vision",
  "speech",
  "audio",
  "image",
  "video",
  "infrastructure",
  "other",
] as const;

const MODEL_ACCESSES = ["open", "api", "open-source", "unknown"] as const;

const DISCOVERY_KINDS = [
  "model",
  "provider",
  "coding-model",
  "open-source-project",
  "developer-tool",
  "infrastructure",
] as const;

const SOURCE_KINDS = [
  "official",
  "github",
  "provider",
  "release-notes",
  "docs",
  "user",
  "other",
] as const;

export { parsePositiveInt };

export function validateOneOf<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  label: string
): ValidationResult<T> {
  if (typeof raw !== "string") {
    return { ok: false, error: `${label} must be a string` };
  }
  const value = raw.trim() as T;
  if (!allowed.includes(value)) {
    return {
      ok: false,
      error: `${label} must be one of: ${allowed.join(", ")}`,
    };
  }
  return { ok: true, value };
}

export function validateModelCategory(
  raw: unknown
): ValidationResult<AIModelCategory> {
  return validateOneOf(raw, MODEL_CATEGORIES, "category");
}

export function validateModelAccess(
  raw: unknown
): ValidationResult<AIModelAccess> {
  return validateOneOf(raw, MODEL_ACCESSES, "access");
}

export function validateDiscoveryKind(
  raw: unknown
): ValidationResult<DiscoveryKind> {
  return validateOneOf(raw, DISCOVERY_KINDS, "kind");
}

export function validateSourceKind(
  raw: unknown
): ValidationResult<AIModelSourceKind> {
  return validateOneOf(raw, SOURCE_KINDS, "source kind");
}

export function validateName(
  raw: unknown,
  label: string,
  max = 200
): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: `${label} must be a string` };
  }
  const value = raw.trim();
  if (value.length === 0 || value.length > max) {
    return {
      ok: false,
      error: `${label} must be between 1 and ${max} characters`,
    };
  }
  return { ok: true, value };
}

export function validateUrl(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "url must be a string" };
  }
  const url = raw.trim();
  if (url.length === 0 || url.length > 2048) {
    return { ok: false, error: "url must be between 1 and 2048 characters" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "url is not a valid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "only http and https URLs are allowed" };
  }
  return { ok: true, value: url };
}

function parseSourcePayload(raw: unknown): AIModelSource | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const urlResult = validateUrl(obj.url);
  if (!urlResult.ok) return undefined;

  const kind = validateSourceKind(obj.kind).ok
    ? (obj.kind as AIModelSourceKind)
    : "other";
  const title =
    typeof obj.title === "string" && obj.title.trim()
      ? obj.title.trim().slice(0, 300)
      : urlResult.value;

  return {
    kind,
    url: urlResult.value,
    title,
    retrievedAt: new Date().toISOString(),
  };
}

export function parseSourcesPayload(
  raw: unknown
): ValidationResult<AIModelSource[]> {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const sources: AIModelSource[] = [];

  if (Array.isArray(obj.sources)) {
    for (const entry of obj.sources) {
      const source = parseSourcePayload(entry);
      if (source) sources.push(source);
      if (sources.length >= 8) break;
    }
  }

  if (sources.length === 0) {
    const fallback = parseSourcePayload({
      url: obj.sourceUrl,
      kind: obj.sourceKind ?? "user",
      title: obj.sourceTitle,
    });
    if (fallback) sources.push(fallback);
  }

  if (sources.length === 0) {
    return {
      ok: false,
      error: "a valid http(s) source url is required (sourceUrl or sources)",
    };
  }

  return { ok: true, value: sources };
}

export function parseConfidence(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(1, Math.max(0, Math.round(raw * 100) / 100));
}

export function parseOptionalPositiveInt(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) {
    return undefined;
  }
  return Math.floor(raw);
}

function perMillion(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return undefined;
  }
  return raw;
}

export function parseModelCost(raw: unknown): ModelCost | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const cost: ModelCost = {
    freeTier: obj.freeTier === true || obj.freeTier === "true",
  };
  const input = perMillion(obj.inputPerMillion);
  const output = perMillion(obj.outputPerMillion);
  if (input !== undefined) cost.inputPerMillion = input;
  if (output !== undefined) cost.outputPerMillion = output;
  if (typeof obj.notes === "string" && obj.notes.trim()) {
    cost.notes = obj.notes.trim().slice(0, 500);
  }
  return cost;
}