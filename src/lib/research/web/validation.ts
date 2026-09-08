/**
 * M4.4 – Strict Security Validation
 * SSRF protection + protocol, size, and redirect limits.
 * Nothing reaches the network without passing through this module.
 */

import type { WebContentType } from "./types";

export interface ValidationResult {
  ok: boolean;
  error?: string;
  normalizedUrl?: string;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

const PRIVATE_IP_REGEX =
  /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|0\.)/;

const DANGEROUS_PROTOCOLS = [
  "file:",
  "ftp:",
  "ftps:",
  "data:",
  "javascript:",
  "vbscript:",
  "blob:",
];

export const DEFAULT_LIMITS = {
  maxRedirects: 5,
  maxResponseBytes: 2_500_000,
  timeoutMs: 12_000,
  maxSearchResults: 10,
  maxSourcesToFetch: 6,
} as const;

/**
 * Validate and normalize a URL before any network request.
 */
export function validateUrl(rawUrl: string): ValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { ok: false, error: "URL is required" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      error: `Only HTTPS is allowed. Received: ${parsed.protocol}`,
    };
  }

  const lower = rawUrl.toLowerCase();
  for (const proto of DANGEROUS_PROTOCOLS) {
    if (lower.startsWith(proto)) {
      return { ok: false, error: `Dangerous protocol blocked: ${proto}` };
    }
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(hostname)) {
    return { ok: false, error: `Blocked host: ${hostname}` };
  }

  if (PRIVATE_IP_REGEX.test(hostname)) {
    return { ok: false, error: `Private or reserved IP blocked: ${hostname}` };
  }

  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal")
  ) {
    return { ok: false, error: `Local domain blocked: ${hostname}` };
  }

  if (hostname.startsWith("[") && hostname.includes(":")) {
    const ipv6 = hostname.slice(1, -1).toLowerCase();
    if (
      ipv6 === "::1" ||
      ipv6.startsWith("fc") ||
      ipv6.startsWith("fd") ||
      ipv6.startsWith("fe80")
    ) {
      return { ok: false, error: `Private IPv6 blocked: ${hostname}` };
    }
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
  };
}

export function isAllowedContentType(
  contentType: string | null
): contentType is WebContentType {
  if (!contentType) return false;
  const clean = contentType.split(";")[0].trim().toLowerCase();
  return (
    clean === "text/html" ||
    clean === "text/plain" ||
    clean === "application/xhtml+xml" ||
    clean === "application/xml"
  );
}

export function validateResponseSize(
  sizeBytes: number,
  maxBytes: number = DEFAULT_LIMITS.maxResponseBytes
): ValidationResult {
  if (sizeBytes < 0) {
    return { ok: false, error: "Invalid response size" };
  }
  if (sizeBytes > maxBytes) {
    return {
      ok: false,
      error: `Response too large: ${sizeBytes} bytes (max ${maxBytes})`,
    };
  }
  return { ok: true };
}

export function validateRedirectCount(
  count: number,
  max: number = DEFAULT_LIMITS.maxRedirects
): ValidationResult {
  if (count > max) {
    return {
      ok: false,
      error: `Too many redirects: ${count} (max ${max})`,
    };
  }
  return { ok: true };
}

export function canFetchUrl(rawUrl: string): ValidationResult {
  return validateUrl(rawUrl);
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

export interface QueryValidation {
  ok: boolean;
  error?: string;
  value?: string;
}

export type QueryValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateWebQuery(raw: unknown): QueryValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "q must be a string" };
  }
  const query = raw.trim();
  if (query.length === 0 || query.length > 256) {
    return {
      ok: false,
      error: "q must be between 1 and 256 characters",
    };
  }
  return { ok: true, value: query };
}

export function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_LIMITS.maxSourcesToFetch;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(raw, 50);
  }
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 50);
  }
  return DEFAULT_LIMITS.maxSourcesToFetch;
}

export interface UrlsPayload {
  urls: string[];
  errors: string[];
}

export function parseUrlsPayload(raw: unknown, max: number): UrlsPayload {
  if (!Array.isArray(raw)) {
    return { urls: [], errors: ["urls must be an array"] };
  }

  const urls: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (typeof entry !== "string") {
      errors.push(`urls[${i}]: must be a string`);
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      errors.push(`urls[${i}]: empty string`);
      continue;
    }
    const validation = validateUrl(trimmed);
    if (!validation.ok) {
      errors.push(`urls[${i}]: ${validation.error}`);
      continue;
    }
    if (urls.length >= max) {
      errors.push(`urls[${i}]: limit of ${max} URLs exceeded`);
      break;
    }
    urls.push(validation.normalizedUrl!);
  }

  return { urls, errors };
}