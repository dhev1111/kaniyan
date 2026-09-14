/**
 * M5.9 – Recall pipeline orchestration.
 * Pure read-only pipeline: normalize → filter → rank → dedup → assemble.
 * Never mutates memory store, versions, or lifecycle state.
 */

import type { MemoryStore } from "../store/store";
import type { RecallRequest, RecallResult } from "./types";
import { normalizeQuery } from "./query";
import { selectCandidates } from "./candidates";
import { rankCandidates } from "./ranking";
import { suppressDuplicates } from "./deduplication";
import { assembleContext } from "./context";

export type RecallPipelineResult =
  | { ok: true; result: RecallResult }
  | { ok: false; code: string; message: string };

export function recall(
  store: MemoryStore,
  request: RecallRequest
): RecallPipelineResult {
  const queryResult = normalizeQuery(request.text);
  if (!queryResult.ok) {
    return { ok: false, code: queryResult.code, message: queryResult.message };
  }

  const normalizedQuery = queryResult.normalized;

  const candidates = selectCandidates(store, {
    ...request,
    text: normalizedQuery.text,
  });

  const ranked = rankCandidates(
    candidates,
    request.scoringWeights,
    request.asOf
  );

  const deduplicated = suppressDuplicates(ranked);

  const context = assembleContext(deduplicated, request.contextBudget);

  return {
    ok: true,
    result: {
      query: normalizedQuery,
      candidates,
      ranked,
      deduplicated,
      context,
      totalCandidatesFound: candidates.length,
      totalRecalled: deduplicated.length,
    },
  };
}
