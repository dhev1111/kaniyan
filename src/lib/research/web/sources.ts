/**
 * M4.4 – Source Selection & Trust Ranking
 */

import type { WebSearchResult, SourceTrustLevel } from "./types";
import { DEFAULT_LIMITS } from "./validation";

const OFFICIAL_DOMAINS = [
  "github.com",
  "docs.github.com",
  "developer.mozilla.org",
  "nodejs.org",
  "react.dev",
  "nextjs.org",
  "typescriptlang.org",
  "w3.org",
  "ietf.org",
  "rfc-editor.org",
  "openai.com",
  "anthropic.com",
  "ai.google.dev",
  "cloud.google.com",
  "learn.microsoft.com",
  "aws.amazon.com",
];

const REPUTABLE_DOMAINS = [
  "stackoverflow.com",
  "stackexchange.com",
  "medium.com",
  "dev.to",
  "css-tricks.com",
  "smashingmagazine.com",
  "freecodecamp.org",
  "wikipedia.org",
  "arxiv.org",
];

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function getTrustLevel(url: string): SourceTrustLevel {
  const domain = getDomain(url);

  if (!domain) return "unknown";

  if (OFFICIAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return "official";
  }

  if (REPUTABLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return "reputable";
  }

  if (
    domain.includes("spam") ||
    domain.includes("click") ||
    domain.length > 40
  ) {
    return "suspicious";
  }

  return "community";
}

export function scoreSource(result: WebSearchResult): number {
  const trust = getTrustLevel(result.url);
  let score = 50;

  switch (trust) {
    case "official":
      score += 40;
      break;
    case "reputable":
      score += 25;
      break;
    case "community":
      score += 10;
      break;
    case "suspicious":
      score -= 30;
      break;
  }

  score += Math.max(0, 10 - result.position);
  return score;
}

/**
 * Select the best sources to fetch from search results.
 */
export function selectSources(
  results: WebSearchResult[],
  maxSources: number = DEFAULT_LIMITS.maxSourcesToFetch
): WebSearchResult[] {
  if (!results || results.length === 0) return [];

  const scored = results
    .map((r) => ({
      result: r,
      score: scoreSource(r),
      trust: getTrustLevel(r.url),
    }))
    .filter((item) => item.trust !== "suspicious")
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxSources).map((item) => item.result);
}