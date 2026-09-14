/**
 * M5.9 – Bounded context assembly.
 * Converts ranked, deduplicated memory results into a compact,
 * structured context within a character budget. Deterministic,
 * bounded, read-only.
 */

import { MEMORY_LIMITS } from "../limits";
import { truncateText } from "../util";
import type {
  AssembledContext,
  ContextItem,
  DeduplicatedCandidate,
} from "./types";

const DEFAULT_BUDGET = MEMORY_LIMITS.MAX_RECALL_CONTEXT_BUDGET;
const ITEM_OVERHEAD = 64;

export function assembleContext(
  candidates: DeduplicatedCandidate[],
  budget: number = DEFAULT_BUDGET
): AssembledContext {
  const effectiveBudget = Math.max(0, Math.min(budget, MEMORY_LIMITS.MAX_RECALL_CONTEXT_BUDGET));
  const items: ContextItem[] = [];
  let totalCharacters = 0;
  let itemsDropped = 0;

  const eligible = candidates
    .filter(c => !c.deduplicated || c.score > 0)
    .sort((a, b) => b.score - a.score || a.memory.id.localeCompare(b.memory.id));

  for (const candidate of eligible) {
    const source = candidate.memory.provenance.sourceKind;
    const baseItem: ContextItem = {
      memoryId: candidate.memory.id,
      content: "",
      version: candidate.versionNumber,
      confidence: candidate.memory.confidence,
      importance: candidate.memory.importance,
      source,
      score: candidate.score,
      reasons: candidate.recallReasons,
    };

    const overhead = ITEM_OVERHEAD + baseItem.memoryId.length + baseItem.source.length;
    const remainingBudget = effectiveBudget - totalCharacters - overhead;

    if (remainingBudget <= 0) {
      itemsDropped++;
      continue;
    }

    const maxContentLength = Math.max(0, remainingBudget);
    baseItem.content = truncateText(candidate.memory.content, maxContentLength);

    const itemChars = overhead + baseItem.content.length;
    if (totalCharacters + itemChars > effectiveBudget) {
      itemsDropped++;
      continue;
    }

    items.push(baseItem);
    totalCharacters += itemChars;
  }

  return {
    items,
    totalCharacters,
    budgetUsed: totalCharacters,
    budgetTotal: effectiveBudget,
    itemsIncluded: items.length,
    itemsDropped,
  };
}
