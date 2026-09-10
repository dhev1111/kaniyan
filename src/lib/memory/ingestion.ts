/**
 * M5.2 – Memory ingestion pipeline.
 * Turns raw sources (research findings, GitHub intelligence, docs, text)
 * into validated, deduplicated memory candidates via normalization,
 * chunking, metadata propagation and provenance stamping.
 */

import { chunkText, type ChunkOptions } from "./chunking";
import { MEMORY_LIMITS } from "./limits";
import { fnv1a36, memoryId, normalizeText, nowIso } from "./util";
import { constructMemory } from "./validation";
import type {
  MemoryReference,
  MemoryScope,
  MemorySourceKind,
  MemoryInput,
} from "./types";

export interface IngestSource {
  id: string;
  kind: MemorySourceKind;
  text: string;
  url?: string;
  title?: string;
  origin?: string;
  projectId?: string;
  taskId?: string;
  sessionId?: string;
  scope?: MemoryScope;
  tags?: string[];
  language?: string;
  author?: string;
  ingestedAt?: string;
}

export interface IngestOptions {
  chunkChars?: number;
  overlapChars?: number;
  maxChunksPerSource?: number;
  existingHashes?: ReadonlySet<string>;
  now?: string;
}

export interface MemoryCandidate {
  reference: MemoryReference;
  sourceRef: string;
  contentHash: string;
  chunkIndex: number;
}

export interface IngestRejection {
  sourceId: string;
  reason: string;
}

export interface IngestStats {
  sources: number;
  acceptedSources: number;
  chunks: number;
  deduplicated: number;
  totalChars: number;
}

export interface IngestResult {
  candidates: MemoryCandidate[];
  rejected: IngestRejection[];
  stats: IngestStats;
}

export type IngestRequest = {
  sources: IngestSource[];
  options?: IngestOptions;
};

function detectScope(source: IngestSource): MemoryScope {
  if (source.scope) return source.scope;
  if (source.projectId) return "project";
  if (source.taskId) return "task";
  if (source.sessionId) return "session";
  return "global";
}

function normalizeTags(source: IngestSource): string[] {
  const tags = (source.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag !== "");
  const unique: string[] = [];
  for (const tag of tags) {
    if (!unique.includes(tag)) unique.push(tag);
  }
  return unique.slice(0, MEMORY_LIMITS.MAX_TAGS_PER_MEMORY);
}

function buildInput(
  source: IngestSource,
  chunkText: string,
  chunkOrigin: string,
  now: string
): MemoryInput {
  const provenance = {
    sourceKind: source.kind,
    sourceId: source.id,
    sourceUrl: source.url,
    origin: chunkOrigin,
    ingestedAt: source.ingestedAt ?? now,
  };
  return {
    content: chunkText,
    type: "semantic",
    source: {
      id: source.id,
      kind: source.kind,
      title: source.title,
      url: source.url,
    },
    metadata: {
      scope: detectScope(source),
      projectId: source.projectId,
      taskId: source.taskId,
      sessionId: source.sessionId,
      tags: normalizeTags(source),
      language: source.language,
      author: source.author,
      extra: {},
    },
    provenance,
    confidence: "medium",
    importance: "medium",
    status: "candidate",
    relationships: [],
  };
}

function reject(result: IngestResult, source: IngestSource, reason: string): void {
  result.rejected.push({ sourceId: source.id, reason });
}

/**
 * Ingests a batch of sources into deduplicated memory candidates.
 * Never throws for bad input: malformed sources are reported in
 * `result.rejected` and oversized batches surface as per-source rejections.
 */
export function ingest(request: IngestRequest): IngestResult {
  const options = request.options ?? {};
  const now = nowIso(options.now);
  const seen = new Set<string>(options.existingHashes ?? []);
  const result: IngestResult = {
    candidates: [],
    rejected: [],
    stats: { sources: request.sources.length, acceptedSources: 0, chunks: 0, deduplicated: 0, totalChars: 0 },
  };

  for (const source of request.sources) {
    if (!source || typeof source.id !== "string" || source.id.trim() === "") {
      reject(result, source ?? { id: "unknown", kind: "text", text: "" }, "source id is required");
      continue;
    }
    if (typeof source.text !== "string") {
      reject(result, source, "text must be a string");
      continue;
    }
    if (!source.kind) {
      reject(result, source, "source kind is required");
      continue;
    }
    const normalized = normalizeText(source.text);
    if (normalized === "") {
      reject(result, source, "empty content");
      continue;
    }
    if (normalized.length > MEMORY_LIMITS.INGEST_MAX_SOURCE_CHARS) {
      reject(result, source, "source text exceeds the ingestion size bound");
      continue;
    }
    if (result.stats.totalChars + normalized.length > MEMORY_LIMITS.MAX_TOTAL_INGEST_CHARS) {
      reject(result, source, "batch exceeds the total ingestion bytes bound");
      continue;
    }
    result.stats.totalChars += normalized.length;

    let chunks: ReturnType<typeof chunkText>;
    try {
      chunks = chunkText(normalized, {
        chunkChars: options.chunkChars,
        overlapChars: options.overlapChars,
        maxChunks: options.maxChunksPerSource,
      });
    } catch (error) {
      reject(result, source, error instanceof Error ? error.message : "chunking failed");
      continue;
    }

    result.stats.acceptedSources += 1;
    result.stats.chunks += chunks.length;

    for (const chunk of chunks) {
      const contentHash = fnv1a36(chunk.content);
      if (seen.has(contentHash)) {
        result.stats.deduplicated += 1;
        continue;
      }
      seen.add(contentHash);
      const chunkOrigin =
        source.origin ?? source.title ?? (chunks.length > 1 ? `chunk ${chunk.index + 1}` : undefined) ?? "text";
      const input = buildInput(source, chunk.content, chunkOrigin, now);
      const reference = constructMemory(input, {
        now,
        id: memoryId("ingest", source.id, contentHash, String(chunk.index)),
      });
      result.candidates.push({
        reference,
        sourceRef: source.id,
        contentHash,
        chunkIndex: chunk.index,
      });
    }
  }

  return result;
}

/** Convenience wrapper used by later milestones for single-document ingestion. */
export function ingestSource(source: IngestSource, options?: IngestOptions): IngestResult {
  return ingest({ sources: [source], options });
}