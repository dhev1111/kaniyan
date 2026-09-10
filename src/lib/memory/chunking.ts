/**
 * M5.2 – Deterministic bounded text chunking.
 * Chunks honour a maximum size, an optional overlap, and a hard chunk-count
 * cap so ingestion can never produce unbounded memory growth.
 */

import { MEMORY_LIMITS } from "./limits";
import { clamp, normalizeText } from "./util";

export interface ChunkOptions {
  chunkChars?: number;
  overlapChars?: number;
  maxChunks?: number;
}

export interface TextChunk {
  index: number;
  content: string;
  start: number;
  end: number;
}

export interface Sentence {
  text: string;
  start: number;
  end: number;
}

/** Splits normalized text into bounded sentences with original offsets. */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let buffer = "";
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (buffer === "") {
      if (/\s/.test(char)) continue;
      start = index;
    }
    buffer += char;
    let boundary = false;
    if (char === "\n") {
      boundary = true;
    } else if (char === "." || char === "!" || char === "?") {
      const rest = text.slice(index + 1);
      let cursor = 0;
      while (cursor < rest.length && /[)"'\]]/.test(rest[cursor])) {
        cursor += 1;
      }
      const after = rest[cursor] ?? "";
      boundary = after === "" || /\s/.test(after);
      if (boundary && cursor > 0) {
        buffer += rest.slice(0, cursor);
        index += cursor;
      }
    }
    if (boundary || index === text.length - 1) {
      const trimmed = buffer.trim();
      if (trimmed !== "") {
        sentences.push({ text: trimmed, start, end: start + trimmed.length });
      }
      buffer = "";
    }
  }
  return sentences;
}

function lastChars(text: string, count: number): string {
  if (text.length <= count) return text;
  return text.slice(text.length - count);
}

function hardSlice(value: string, target: number): string[] {
  const pieces: string[] = [];
  for (let index = 0; index < value.length; index += target) {
    pieces.push(value.slice(index, index + target));
  }
  return pieces;
}

/** Word-wraps a long sentence into bounded pieces (with a final hard slice). */
export function wordWrap(text: string, target: number): string[] {
  const words = text.split(/\s+/);
  const groups: string[] = [];
  let current = "";
  for (const word of words) {
    if (current === "") {
      current = word;
      continue;
    }
    const candidate = `${current} ${word}`;
    if (candidate.length <= target) {
      current = candidate;
    } else {
      groups.push(current);
      current = word;
    }
  }
  if (current !== "") groups.push(current);
  const result: string[] = [];
  for (const group of groups) {
    if (group.length <= target) {
      result.push(group);
    } else {
      result.push(...hardSlice(group, target));
    }
  }
  return result;
}

/**
 * Chunking is deterministic, order-preserving and bounds-checked.
 * Throws when the number of chunks would exceed the cap.
 */
export function chunkText(input: string, options: ChunkOptions = {}): TextChunk[] {
  const target = clamp(
    Math.floor(options.chunkChars ?? MEMORY_LIMITS.DEFAULT_CHUNK_CHARS),
    16,
    500_000
  );
  const overlap = clamp(
    Math.floor(options.overlapChars ?? MEMORY_LIMITS.DEFAULT_OVERLAP_CHARS),
    0,
    MEMORY_LIMITS.MAX_OVERLAP_CHARS
  );
  const maxChunks = options.maxChunks ?? MEMORY_LIMITS.DEFAULT_MAX_CHUNKS_PER_SOURCE;
  if (maxChunks < 1) {
    throw new Error("maxChunks must be at least 1");
  }

  const text = normalizeText(input);
  const sentences = splitSentences(text);
  const chunks: TextChunk[] = [];

  const flush = (pending: string[], pendingStart: number, pendingEnd: number): void => {
    const body = pending.join(" ");
    const prefix =
      overlap > 0 && chunks.length > 0
        ? lastChars(
            chunks[chunks.length - 1].content,
            Math.min(overlap, Math.max(0, target - body.length - 1))
          )
        : "";
    chunks.push({
      index: chunks.length,
      content: prefix === "" ? body : `${prefix} ${body}`,
      start: pendingStart,
      end: pendingEnd,
    });
  };

  let pending: string[] = [];
  let pendingStart = -1;
  let pendingEnd = -1;

  const flushPending = (): void => {
    if (pending.length > 0) {
      flush(pending, pendingStart, pendingEnd);
      pending = [];
      pendingStart = -1;
      pendingEnd = -1;
    }
  };

  for (const sentence of sentences) {
    if (sentence.text.length > target) {
      flushPending();
      for (const piece of wordWrap(sentence.text, target)) {
        pending = [piece];
        flush(pending, sentence.start, sentence.end);
        pending = [];
      }
      continue;
    }
    const needed =
      pending.length > 0
        ? pending.join(" ").length + 1 + sentence.text.length
        : sentence.text.length;
    if (needed <= target) {
      if (pendingStart < 0) pendingStart = sentence.start;
      pending.push(sentence.text);
      pendingEnd = sentence.end;
    } else {
      flushPending();
      pending = [sentence.text];
      pendingStart = sentence.start;
      pendingEnd = sentence.end;
    }
  }
  flushPending();

  if (chunks.length > maxChunks) {
    throw new Error(
      `text produced ${chunks.length} chunks which exceeds the ${maxChunks} chunk cap`
    );
  }
  return chunks;
}