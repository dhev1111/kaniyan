/**
 * M4.4 – Safe Web Page Fetcher
 * Uses strict validation. No JavaScript execution. Bounded size & timeout.
 * Redirects are handled manually: every hop is independently validated
 * against the URL/SSRF security layer before it is followed.
 */

import {
  validateUrl,
  isAllowedContentType,
  validateRedirectCount,
  DEFAULT_LIMITS,
} from "./validation";
import type { WebPage, WebContentType } from "./types";

export interface FetchOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
}

export interface FetchResult {
  success: boolean;
  page?: WebPage;
  error?: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

export async function fetchWebPage(
  rawUrl: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIMITS.timeoutMs;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_LIMITS.maxResponseBytes;
  const maxRedirects = options.maxRedirects ?? DEFAULT_LIMITS.maxRedirects;

  // 1. Validate the initial URL first (SSRF protection)
  const initial = validateUrl(rawUrl);
  if (!initial.ok || !initial.normalizedUrl) {
    return { success: false, error: initial.error ?? "Invalid URL" };
  }

  const requestedUrl = initial.normalizedUrl;
  let currentUrl = requestedUrl;
  let redirectCount = 0;

  try {
    let controller = new AbortController();
    let response: Response | undefined;

    // Manual redirect following. Each redirect destination is resolved
    // against the current URL and separately validated before it is fetched.
    while (true) {
      controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let current: Response;
      try {
        current = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": "KANIYAN-Research/1.0 (safe-research-bot)",
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
          },
        });
      } finally {
        clearTimeout(timer);
      }

      if (!isRedirectStatus(current.status)) {
        response = current;
        break;
      }

      redirectCount += 1;
      const redirectCheck = validateRedirectCount(redirectCount, maxRedirects);
      if (!redirectCheck.ok) {
        return { success: false, error: redirectCheck.error };
      }

      const location = current.headers.get("location");
      if (!location || location.trim().length === 0) {
        return {
          success: false,
          error: `Redirect ${current.status} did not include a Location header`,
        };
      }

      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        return {
          success: false,
          error: "Redirect Location could not be resolved to a valid URL",
        };
      }

      const nextValidation = validateUrl(nextUrl);
      if (!nextValidation.ok || !nextValidation.normalizedUrl) {
        return {
          success: false,
          error: `Redirect destination blocked: ${
            nextValidation.error ?? "invalid URL"
          }`,
        };
      }

      currentUrl = nextValidation.normalizedUrl;
    }

    if (!response) {
      return { success: false, error: "No response received" };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentTypeHeader = response.headers.get("content-type");
    if (!isAllowedContentType(contentTypeHeader)) {
      return {
        success: false,
        error: `Content-Type not allowed: ${contentTypeHeader ?? "unknown"}`,
      };
    }

    const contentType = (contentTypeHeader?.split(";")[0].trim().toLowerCase() ||
      "other") as WebContentType;

    if (!response.body) {
      return { success: false, error: "Response body unavailable" };
    }

    // Stream the body with a hard byte cap so an oversized response is
    // never buffered in memory beyond maxResponseBytes.
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    const readTimer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxResponseBytes) {
          controller.abort();
          return {
            success: false,
            error: `Response too large: exceeded ${maxResponseBytes} byte limit`,
          };
        }
        chunks.push(value);
      }
    } finally {
      clearTimeout(readTimer);
      reader.releaseLock();
    }

    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const rawText = new TextDecoder("utf-8").decode(buffer);

    // Try to extract title (simple)
    let title: string | undefined;
    const titleMatch = rawText.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim().slice(0, 200);
    }

    const page: WebPage = {
      url: requestedUrl,
      finalUrl: response.url || currentUrl,
      statusCode: response.status,
      contentType,
      rawText,
      sizeBytes: received,
      fetchedAt: new Date().toISOString(),
      redirectCount,
      title,
    };

    return { success: true, page };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: `Timeout after ${timeoutMs}ms` };
    }

    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Fetch failed: ${message}` };
  }
}