/**
 * M4.4 – Web Research Service
 * Main pipeline: Search → Select → Fetch → Extract → Verify → Rank
 */

import type {
  WebSearchQuery,
  WebSearchResult,
  WebPage,
  ExtractedClaim,
  VerificationResult,
  RankedFinding,
  WebResearchOptions,
  WebResearchResult,
} from "./types";
import { DEFAULT_LIMITS } from "./validation";
import { selectSources } from "./sources";
import { fetchWebPage } from "./fetcher";
import { extractClaims } from "./extractor";
import { verifyClaims } from "./verifier";
import { rankFindings } from "./ranking";
import { rangeResults } from "./ranging";

export interface WebResearchServiceOptions extends WebResearchOptions {
  searchFn?: (query: WebSearchQuery) => Promise<WebSearchResult[]>;
}

async function defaultSearch(query: WebSearchQuery): Promise<WebSearchResult[]> {
  console.warn("[WebResearch] No real search provider configured yet.");
  return [];
}

export class WebResearchService {
  private searchFn: (query: WebSearchQuery) => Promise<WebSearchResult[]>;

  constructor(options: WebResearchServiceOptions = {}) {
    this.searchFn = options.searchFn ?? defaultSearch;
  }

  async research(
    query: string,
    options: WebResearchOptions = {}
  ): Promise<WebResearchResult> {
    const startedAt = Date.now();
    const warnings: string[] = [];

    const maxSources = options.maxSources ?? DEFAULT_LIMITS.maxSourcesToFetch;
    const maxClaimsPerPage = options.maxClaimsPerPage ?? 5;

    // 1. Search
    const searchStart = Date.now();
    let searchResults: WebSearchResult[] = [];

    try {
      searchResults = await this.searchFn({
        query,
        maxResults: DEFAULT_LIMITS.maxSearchResults,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Search failed: ${message}`);
    }

    const searchTimeMs = Date.now() - searchStart;

    // 2. Select best sources
    const selected = selectSources(searchResults, maxSources);

    // 3. Fetch pages
    const fetchStart = Date.now();
    const pagesFetched: WebPage[] = [];
    let sourcesFailed = 0;

    for (const result of selected) {
      const fetchResult = await fetchWebPage(result.url, {
        timeoutMs: options.timeoutMs,
        maxResponseBytes: options.maxResponseBytes,
      });

      if (fetchResult.success && fetchResult.page) {
        pagesFetched.push(fetchResult.page);
      } else {
        sourcesFailed += 1;
        warnings.push(
          `Failed to fetch ${result.url}: ${fetchResult.error ?? "unknown error"}`
        );
      }
    }

    const fetchTimeMs = Date.now() - fetchStart;

    // 4. Extract claims
    const allClaims: ExtractedClaim[] = [];
    for (const page of pagesFetched) {
      const claims = extractClaims(page, maxClaimsPerPage);
      allClaims.push(...claims);
    }

    // 5. Verify claims
    const verifications: VerificationResult[] = verifyClaims(allClaims);

    // 6. Rank findings
    const rankedFindings: RankedFinding[] = rankFindings(
      allClaims,
      verifications
    );

    // 7. Apply ranging (score + final rank) over the ranked findings
    const rangedFindings: RankedFinding[] = rangeResults(rankedFindings);

    const totalTimeMs = Date.now() - startedAt;

    return {
      query,
      searchedAt: new Date().toISOString(),
      searchResults,
      pagesFetched,
      claims: allClaims,
      verifications,
      rankedFindings: rangedFindings,
      warnings,
      metrics: {
        searchTimeMs,
        fetchTimeMs,
        totalTimeMs,
        sourcesSelected: selected.length,
        sourcesFetched: pagesFetched.length,
        sourcesFailed,
      },
    };
  }
}

export const webResearchService = new WebResearchService();
