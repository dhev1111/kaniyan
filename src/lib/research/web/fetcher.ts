/**
 * M4.4 – Safe Web Page Fetcher
 * Uses strict validation. No JavaScript execution. Bounded size & timeout.
 */

import {
  validateUrl,
  isAllowedContentType,
  validateResponseSize,
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

export async function fetchWebPage(
  rawUrl: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIMITS.timeoutMs;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_LIMITS.maxResponseBytes;
  const maxRedirects = options.maxRedirects ?? DEFAULT_LIMITS.maxRedirects;

  // 1. Validate URL first (SSRF protection)
  const validation = validateUrl(rawUrl);
  if (!validation.ok || !validation.normalizedUrl) {
    return { success: false, error: validation.error ?? "Invalid URL" };
  }

  const url = validation.normalizedUrl;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "KANIYAN-Research/1.0 (safe-research-bot)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeoutId);

    // Check redirect count (best effort)
    const redirectCount = response.redirected ? 1 : 0;
    const redirectCheck = validateRedirectCount(redirectCount, maxRedirects);
    if (!redirectCheck.ok) {
      return { success: false, error: redirectCheck.error };
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

    // Read body with size limit
    const buffer = await response.arrayBuffer();
    const sizeBytes = buffer.byteLength;

    const sizeCheck = validateResponseSize(sizeBytes, maxResponseBytes);
    if (!sizeCheck.ok) {
      return { success: false, error: sizeCheck.error };
    }

    const rawText = new TextDecoder("utf-8").decode(buffer);

    // Try to extract title (simple)
    let title: string | undefined;
    const titleMatch = rawText.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim().slice(0, 200);
    }

    const page: WebPage = {
      url,
      finalUrl: response.url || url,
      statusCode: response.status,
      contentType,
      rawText,
      sizeBytes,
      fetchedAt: new Date().toISOString(),
      redirectCount,
      title,
    };

    return { success: true, page };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: `Timeout after ${timeoutMs}ms` };
    }

    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Fetch failed: ${message}` };
  }
}
