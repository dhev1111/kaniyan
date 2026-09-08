/**
 * M4.4 – Content Extractor
 * Extracts readable text and simple claims from fetched pages.
 * Conservative and safe – does not execute JavaScript.
 */

import type { WebPage, ExtractedClaim } from "./types";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Very simple HTML to text cleaner.
 */
function cleanHtml(html: string): string {
  let text = html;

  // Remove script and style tags
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");

  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Extract simple claims from cleaned text.
 * This is intentionally conservative.
 */
export function extractClaims(
  page: WebPage,
  maxClaims = 5
): ExtractedClaim[] {
  const cleaned = cleanHtml(page.rawText);

  if (cleaned.length < 50) {
    return [];
  }

  // Split into sentences (simple approach)
  const sentences = cleaned
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 400);

  const claims: ExtractedClaim[] = [];

  for (const sentence of sentences.slice(0, maxClaims * 2)) {
    // Basic filter: prefer sentences that look like statements
    if (
      sentence.includes(" is ") ||
      sentence.includes(" are ") ||
      sentence.includes(" can ") ||
      sentence.includes(" will ") ||
      sentence.includes(" has ") ||
      sentence.includes(" supports ") ||
      /\d/.test(sentence)
    ) {
      claims.push({
        id: generateId(),
        claim: sentence,
        supportingQuote: sentence.slice(0, 300),
        confidence: 0.55,
        sourceUrl: page.finalUrl || page.url,
        extractedAt: new Date().toISOString(),
      });
    }

    if (claims.length >= maxClaims) break;
  }

  return claims;
}