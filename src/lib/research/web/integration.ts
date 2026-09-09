/**
 * M4.4 – Web Research API Integration
 * Route-facing helpers: run research, search configured provider, record results.
 * Follows the same pattern as src/lib/research/github/integration.ts.
 */

import type {
  WebSearchResult,
  ExtractedClaim,
  VerificationResult,
  RankedFinding,
} from "./types";
import { fetchWebPage } from "./fetcher";
import { extractClaims } from "./extractor";
import { verifyClaims } from "./verifier";
import { rankFindings } from "./ranking";
import { validateUrl, DEFAULT_LIMITS } from "./validation";

// ── Report types consumed by API routes ─────────────────────────────────────

export interface WebResearchSourceReport {
  url: string;
  title?: string;
  status: "fetched" | "skipped" | "failed";
  error?: string;
  finalUrl?: string;
}

export interface WebResearchReport {
  query: string;
  urls: string[];
  sources: WebResearchSourceReport[];
  claims: ExtractedClaim[];
  verifications: VerificationResult[];
  rankedFindings: RankedFinding[];
  warnings: string[];
}

// ── Integration record (mirrors github/integration.ts) ──────────────────────

export interface WebResearchIntegrationRecord {
  jobId: string;
  runId: string;
  sourceIds: string[];
  findingIds: string[];
}

interface ResearchServiceLike {
  createJob(input: {
    projectId: string;
    title: string;
    query: string;
    priority?: string;
    createdBy: string;
  }): { id: string };
  startRun(
    jobId: string
  ): { success: boolean; error?: string; run?: { id: string } };
  addSource(
    runId: string,
    data: Record<string, unknown>
  ): { success: boolean; error?: string; source?: { id: string } };
  addFinding(
    runId: string,
    data: Record<string, unknown>
  ): { success: boolean; error?: string; finding?: { id: string } };
  completeRun(runId: string): { success: boolean };
}

// ── runWebResearch ──────────────────────────────────────────────────────────

export async function runWebResearch(options: {
  query: string;
  urls: string[];
  limit?: number;
}): Promise<WebResearchReport> {
  const limit = options.limit ?? DEFAULT_LIMITS.maxSourcesToFetch;
  const warnings: string[] = [];
  const sources: WebResearchSourceReport[] = [];
  const pagesFetched: import("./types").WebPage[] = [];

  for (const url of options.urls.slice(0, limit)) {
    const validation = validateUrl(url);
    if (!validation.ok) {
      sources.push({ url, status: "failed", error: validation.error });
      continue;
    }

    const result = await fetchWebPage(url);
    if (result.success && result.page) {
      sources.push({
        url,
        title: result.page.title,
        status: "fetched",
        finalUrl: result.page.finalUrl,
      });
      pagesFetched.push(result.page);
    } else {
      sources.push({ url, status: "failed", error: result.error });
      warnings.push(`Failed to fetch ${url}: ${result.error}`);
    }
  }

  for (const url of options.urls.slice(limit)) {
    sources.push({ url, status: "skipped" });
  }

  const claims: ExtractedClaim[] = [];
  for (const page of pagesFetched) {
    claims.push(...extractClaims(page));
  }

  const verifications = verifyClaims(claims);
  const rankedFindings = rankFindings(claims, verifications);

  return {
    query: options.query,
    urls: options.urls,
    sources,
    claims,
    verifications,
    rankedFindings,
    warnings,
  };
}

// ── searchWithConfiguredProvider ────────────────────────────────────────────

export async function searchWithConfiguredProvider(
  query: string,
  limit: number
): Promise<{ available: boolean; error?: string; results: WebSearchResult[] }> {
  const searchUrl = process.env.KANIYAN_WEB_SEARCH_URL;
  if (!searchUrl) {
    return { available: false, results: [] };
  }

  try {
    const url = new URL(searchUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "KANIYAN-Research/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(DEFAULT_LIMITS.timeoutMs),
    });

    if (!response.ok) {
      return {
        available: true,
        error: `Search provider returned HTTP ${response.status}`,
        results: [],
      };
    }

    const text = await response.text();
    const data: unknown = JSON.parse(text);

    const rawResults: unknown[] =
      typeof data === "object" && data !== null
        ? Array.isArray((data as Record<string, unknown>).results)
          ? (data as Record<string, unknown>).results as unknown[]
          : Array.isArray(data)
            ? data
            : []
        : [];

    const results: WebSearchResult[] = rawResults
      .filter(
        (r): r is Record<string, unknown> =>
          typeof r === "object" && r !== null
      )
      .slice(0, limit)
      .map((r, i) => ({
        title: typeof r.title === "string" ? r.title : "",
        url: typeof r.url === "string" ? r.url : "",
        snippet: typeof r.snippet === "string" ? r.snippet : "",
        position: i + 1,
        source: "search-provider",
      }));

    return { available: true, results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { available: true, error: message, results: [] };
  }
}

// ── recordWebResearchReport ─────────────────────────────────────────────────

export function recordWebResearchReport(
  service: ResearchServiceLike,
  report: WebResearchReport
): {
  success: boolean;
  error?: string;
  record?: WebResearchIntegrationRecord;
} {
  const job = service.createJob({
    projectId: "web-research",
    title: report.query.slice(0, 120),
    query: report.query,
    priority: "medium",
    createdBy: "web-research",
  });

  const runResult = service.startRun(job.id);
  if (!runResult.success || !runResult.run) {
    return {
      success: false,
      error: runResult.error ?? "Failed to start research run",
    };
  }
  const runId = runResult.run.id;

  const sourceIds: string[] = [];
  // Canonical mapping from every URL a recorded source is reachable at
  // (requested URL and post-redirect final URL) to its ResearchService id.
  const sourceIdByUrl = new Map<string, string>();

  for (const sourceReport of report.sources) {
    if (sourceReport.status !== "fetched") continue;

    const sourceResult = service.addSource(runId, {
      url: sourceReport.url,
      title: sourceReport.title ?? sourceReport.url,
      sourceType: "web",
      publisher: new URL(sourceReport.url).hostname,
      accessedAt: new Date().toISOString(),
      reliability: "unknown",
      status: "accessed",
    });
    if (sourceResult.success && sourceResult.source) {
      sourceIds.push(sourceResult.source.id);
      sourceIdByUrl.set(sourceReport.url, sourceResult.source.id);
      if (sourceReport.finalUrl && sourceReport.finalUrl !== sourceReport.url) {
        sourceIdByUrl.set(sourceReport.finalUrl, sourceResult.source.id);
      }
    }
  }

  const claimsBySource = new Map<string, ExtractedClaim[]>();
  for (const claim of report.claims) {
    const sourceId = sourceIdByUrl.get(claim.sourceUrl);
    if (!sourceId) continue;
    const existing = claimsBySource.get(sourceId) ?? [];
    existing.push(claim);
    claimsBySource.set(sourceId, existing);
  }

  const findingIds: string[] = [];
  for (const [sourceId, claims] of claimsBySource) {
    for (const claim of claims) {
      const findingResult = service.addFinding(runId, {
        sourceId,
        claim: claim.claim,
        evidence: claim.supportingQuote,
        confidence: claim.confidence,
      });
      if (findingResult.success && findingResult.finding) {
        findingIds.push(findingResult.finding.id);
      }
    }
  }

  service.completeRun(runId);

  return {
    success: true,
    record: { jobId: job.id, runId, sourceIds, findingIds },
  };
}
