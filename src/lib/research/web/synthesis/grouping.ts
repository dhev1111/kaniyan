/**
 * M4.5 – Deterministic Evidence Grouping
 * Groups related findings by normalized claim content.
 */

import type { RankedFinding } from "../types";
import type { EvidenceGroup } from "./types";

const NEGATION_TOKENS = new Set([
  "not",
  "no",
  "never",
  "cannot",
  "cant",
  "without",
  "lacks",
  "lacking",
  "none",
  "nor",
]);

const CONTRACTION_MAP: Record<string, string> = {
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "can't": "cannot",
  "cannot": "cannot",
  "cant": "cannot",
  "won't": "will not",
  "wouldn't": "would not",
  "couldn't": "could not",
  "shouldn't": "should not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "it's": "it is",
  "that's": "that is",
  "there's": "there is",
  "what's": "what is",
  "i'm": "i am",
  "you're": "you are",
  "they're": "they are",
  "we're": "we are",
  "i've": "i have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "we'll": "we will",
  "they'll": "they will",
  "n't": " not",
};

function expandContractions(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((word) => CONTRACTION_MAP[word] ?? word)
    .join(" ");
}

export function normalizeClaimText(text: string): string {
  const expanded = expandContractions(text);

  return expanded
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function claimTokens(text: string): string[] {
  return normalizeClaimText(text)
    .split(" ")
    .filter((token) => token.length > 2 && !NEGATION_TOKENS.has(token))
    .sort();
}

export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(claimTokens(a));
  const tokensB = new Set(claimTokens(b));

  const union = new Set([...tokensA, ...tokensB]);
  if (union.size === 0) return 1;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  return intersection / union.size;
}

export function claimsOverlap(a: string, b: string, threshold = 0.5): boolean {
  const tokensA = new Set(claimTokens(a));
  const tokensB = new Set(claimTokens(b));

  if (tokensA.size === 0 || tokensB.size === 0) return false;

  const smaller = Math.min(tokensA.size, tokensB.size);

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  return intersection / smaller >= threshold;
}

export function negationScore(text: string): number {
  const tokens = normalizeClaimText(text).split(" ");
  let count = 0;
  for (const token of tokens) {
    if (NEGATION_TOKENS.has(token)) count++;
  }
  return count;
}

export function groupFindings(
  findings: RankedFinding[],
  overlapThreshold = 0.5
): EvidenceGroup[] {
  const groups: EvidenceGroup[] = [];
  const pointer = findings.slice().sort((a, b) => b.finalScore - a.finalScore);

  for (const finding of pointer) {
    const claimText = finding.claim.claim;
    let matched: EvidenceGroup | undefined;

    for (const group of groups) {
      if (claimsOverlap(group.key, claimText, overlapThreshold)) {
        matched = group;
        break;
      }
    }

    if (matched) {
      matched.findings.push(finding);
    } else {
      groups.push({
        key: normalizeClaimText(claimText),
        representativeId: finding.claim.id,
        findings: [finding],
      });
    }
  }

  groups.forEach((group) => {
    group.findings.sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        a.claim.id.localeCompare(b.claim.id)
    );
  });

  return groups;
}