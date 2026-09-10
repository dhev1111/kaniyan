/**
 * M5.2 – Memory ingestion pipeline: normalization, chunking, metadata
 * propagation, deduplication and rejection of malformed input.
 */

import { ingest, ingestSource, type IngestSource } from "../ingestion";
import {
  chunkText,
  splitSentences,
  wordWrap,
  type TextChunk,
} from "../chunking";
import { fnv1a36, normalizeText } from "../util";
import { MEMORY_LIMITS } from "../limits";

const NOW = "2026-02-01T00:00:00.000Z";

function source(overrides: Partial<IngestSource> = {}): IngestSource {
  return {
    id: "src-1",
    kind: "text",
    text: "KANIYAN stores memory in five categories. Working memory holds transient state. Episodic memory records prior runs. Semantic memory captures verified facts.",
    origin: "architecture notes",
    ...overrides,
  };
}

function longestSharedPrefixSuffix(prev: string, current: string): number {
  let best = 0;
  const limit = Math.min(prev.length, current.length);
  for (let windowSize = 1; windowSize <= limit; windowSize += 1) {
    if (prev.endsWith(current.slice(0, windowSize))) best = windowSize;
  }
  return best;
}

describe("M5.2 chunking", () => {
  it("splits text into bounded, deterministic chunks", () => {
    const text =
      "First sentence about memory. Second sentence about retrieval. Third sentence about reranking. Fourth about consolidation. Fifth about evaluation. Sixth about security. Seventh about verification.";
    const first = chunkText(text, { chunkChars: 80, overlapChars: 0 });
    const second = chunkText(text, { chunkChars: 80, overlapChars: 0 });
    expect(first.map((chunk) => chunk.content)).toEqual(
      second.map((chunk) => chunk.content)
    );
    expect(first.length).toBeGreaterThan(1);
    for (const chunk of first) {
      expect(chunk.content.length).toBeLessThanOrEqual(80);
    }
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index].start).toBeGreaterThanOrEqual(first[index - 1].end);
    }
  });

  it("never exceeds the chunk cap and throws with a bounded message", () => {
    const text = Array.from({ length: 50 }, (_, index) => `Sentence number ${index}.`).join(" ");
    const overflow = chunkText(text, { chunkChars: 64, maxChunks: 50 });
    expect(overflow.length).toBeLessThanOrEqual(50);
    expect(() => chunkText(text, { chunkChars: 64, maxChunks: 3 })).toThrow(/chunk cap/);
  });

  it("is sentence-boundary aware", () => {
    const text = "Alpha beta. Gamma delta! Epsilon zeta?";
    const chunks = chunkText(text, { chunkChars: 1000, overlapChars: 0 });
    expect(chunks.length).toBe(1);
    expect(splitSentences(normalizeText(text)).length).toBe(3);
  });

  it("word-wraps single sentences that exceed the target", () => {
    const long =
      "verification verification verification verification verification verification verification verification verification verification verification verification verification verification verification verification verification verification verification verification";
    const pieces = wordWrap(long, 50);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(50);
    }
    const hard = chunkText(`${long}.`, { chunkChars: 64, overlapChars: 0, maxChunks: 50 });
    for (const chunk of hard) {
      expect(chunk.content.length).toBeLessThanOrEqual(64);
    }
  });

  it("handles overlap prefixes while staying within bounds", () => {
    const text = Array.from({ length: 20 }, (_, index) => `Sentence ${index} about memory.`).join(" ");
    const chunks = chunkText(text, { chunkChars: 120, overlapChars: 30 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(120);
    }
    for (let index = 1; index < chunks.length; index += 1) {
      const shared = longestSharedPrefixSuffix(chunks[index - 1].content, chunks[index].content);
      expect(shared).toBeGreaterThanOrEqual(1);
      expect(shared).toBeLessThanOrEqual(30 + 1);
    }
  });

  it("strips control characters and collapses whitespace deterministically", () => {
    const messy = "\u0000KANIYAN\t\tmemory.\n\n\n\nNext paragraph.\u007f";
    const chunks = chunkText(messy, { chunkChars: 200, overlapChars: 0 });
    const joined = chunks.map((chunk) => chunk.content).join(" ");
    expect(joined).toContain("KANIYAN memory.");
    expect(joined).toContain("Next paragraph.");
    expect(joined.includes("\u0000")).toBe(false);
    expect(joined.includes("\u007f")).toBe(false);
  });
});

describe("M5.2 ingestion", () => {
  it("ingests a single source into one candidate with provenance", () => {
    const result = ingest({ sources: [source()], options: { now: NOW } });
    expect(result.rejected).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.reference.id.startsWith("mem-")).toBe(true);
    expect(candidate.reference.type).toBe("semantic");
    expect(candidate.reference.status).toBe("candidate");
    expect(candidate.reference.provenance.ingestedAt).toBe(NOW);
    expect(candidate.reference.provenance.sourceId).toBe("src-1");
    expect(candidate.reference.metadata.tags).toEqual([]);
    expect(candidate.contentHash).toBe(fnv1a36(candidate.reference.content));
  });

  it("chunks long documents into multiple ordered candidates", () => {
    const long = Array.from(
      { length: 30 },
      (_, index) => `Sentence ${index} about the memory subsystem and its behaviour.`
    ).join(" ");
    const result = ingest({
      sources: [source({ id: "docs-1", text: long })],
      options: { now: NOW, chunkChars: 120, overlapChars: 0 },
    });
    expect(result.candidates.length).toBeGreaterThan(1);
    const indexes = result.candidates.map((candidate) => candidate.chunkIndex);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    for (const candidate of result.candidates) {
      expect(candidate.reference.content.length).toBeLessThanOrEqual(120);
      expect(candidate.reference.id).toMatch(/^mem-/);
    }
  });

  it("deduplicates identical chunk hashes within one batch", () => {
    const result = ingest({
      sources: [source({ text: "Identical sentence full stop." }), source({ id: "dup", text: "Identical sentence full stop." })],
      options: { now: NOW },
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.stats.deduplicated).toBe(1);
  });

  it("deduplicates against existing hashes supplied by the store", () => {
    const text = "Already stored sentence somewhere.";
    const existing = new Set<string>([fnv1a36(normalizeText(text))]);
    const result = ingest({
      sources: [source({ text })],
      options: { now: NOW, existingHashes: existing },
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.stats.deduplicated).toBe(1);
  });

  it("propagates project, task and session scopes with tags", () => {
    const project = ingest({
      sources: [source({ projectId: "proj-a", tags: ["rag", "rag"] })],
      options: { now: NOW },
    });
    expect(project.candidates[0].reference.metadata.scope).toBe("project");
    expect(project.candidates[0].reference.metadata.projectId).toBe("proj-a");
    expect(project.candidates[0].reference.metadata.tags).toEqual(["rag"]);

    const task = ingest({
      sources: [source({ taskId: "task-1", scope: "task" })],
      options: { now: NOW },
    });
    expect(task.candidates[0].reference.metadata.scope).toBe("task");
    expect(task.candidates[0].reference.metadata.taskId).toBe("task-1");
  });

  it("rejects empty, oversized and malformed sources without throwing", () => {
    const result = ingest({
      sources: [
        source({ text: "   " }),
        source({ id: "", text: "bad id" }),
        source({ kind: "text", text: "x".repeat(MEMORY_LIMITS.INGEST_MAX_SOURCE_CHARS + 1) }),
        source({ kind: "text", text: "fine text." }),
      ],
      options: { now: NOW },
    });
    expect(result.rejected.map((entry) => entry.reason).sort()).toEqual([
      "empty content",
      "source id is required",
      "source text exceeds the ingestion size bound",
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.stats.acceptedSources).toBe(1);
  });

  it("rejects batches that exceed the total bytes bound", () => {
    const big = "y".repeat(600_000);
    const result = ingest({
      sources: Array.from({ length: 10 }, (_, index) => source({ id: `b-${index}`, text: big })),
      options: { now: NOW, maxChunksPerSource: 500 },
    });
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.rejected.some((entry) => entry.reason.includes("total ingestion"))).toBe(true);
  });

  it("ingestSource convenience wrapper behaves like single-source ingest", () => {
    const result = ingestSource(source({ id: "wrapped" }), { now: NOW });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].sourceRef).toBe("wrapped");
  });

  it("produces deterministic outputs for identical inputs", () => {
    const text = Array.from({ length: 10 }, (_, index) => `Sentence ${index} repeated for determinism.`).join(" ");
    const first = ingest({ sources: [source({ text })], options: { now: NOW } });
    const second = ingest({ sources: [source({ text })], options: { now: NOW } });
    expect(first.candidates.map((entry) => entry.reference.id)).toEqual(
      second.candidates.map((entry) => entry.reference.id)
    );
    expect(first.candidates.map((entry) => entry.reference.content)).toEqual(
      second.candidates.map((entry) => entry.reference.content)
    );
  });
});

describe("M5.2 util integration", () => {
  it("normalizes text before hashing so dedup is whitespace-insensitive", () => {
    const rawA = "Padded sentence.   ";
    const rawB = "  Padded sentence.";
    expect(fnv1a36(rawA)).not.toBe(fnv1a36(rawB));
    expect(fnv1a36(normalizeText(rawA))).toBe(fnv1a36(normalizeText(rawB)));
  });

  it("exposes TextChunk shape used by retrieval source mapping", () => {
    const chunk: TextChunk = { index: 0, content: "data", start: 0, end: 4 };
    expect(chunk.index).toBe(0);
    expect(chunk.content.length).toBe(4);
  });
});