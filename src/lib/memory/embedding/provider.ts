/**
 * M5.3 – Embedding provider abstraction.
 * Provider-agnostic, asynchronous, bounded and stateless. Real vendored
 * providers plug in behind this interface; the deterministic provider exists
 * for offline development and deterministic tests.
 */

import { MEMORY_LIMITS } from "../limits";
import { fnv1a36 } from "../util";
import {
  assertEmbeddingDimension,
  assertEmbeddingRequest,
  assertEmbeddingVector,
  clampEmbeddingBatch,
} from "./validation";
import type { EmbeddingExport, EmbeddingRequest, EmbeddingResponse } from "./types";

export interface EmbeddingProvider {
  readonly providerId: string;
  readonly dimensions: number;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  embedMany(requests: EmbeddingRequest[]): Promise<EmbeddingResponse[]>;
  describe(): EmbeddingExport;
}

export interface DeterministicEmbeddingOptions {
  providerId?: string;
  model?: string;
}

const DEFAULT_MODEL = "kaniyan/deterministic";

function nextBody(tokenHash: string, dimensions: number): [number, number, number] {
  let value = 0;
  for (let index = 0; index < tokenHash.length; index += 1) {
    value = (value * 33 + tokenHash.charCodeAt(index)) >>> 0;
  }
  const start = value % dimensions;
  const spread = (value >> 3) % Math.max(1, dimensions / 4);
  const weight = 1 + (value % 5);
  return [start, spread, weight];
}

/**
 * A tiny offline provider: pure hashing with provider-level dimension
 * consistency. Never performs network calls and exposes no mutable state.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly providerId: string;
  readonly dimensions: number;
  private readonly model: string;

  constructor(dimensions: number, options: DeterministicEmbeddingOptions = {}) {
    const validated = assertEmbeddingDimension(dimensions);
    this.dimensions = validated;
    this.providerId = options.providerId ?? "deterministic";
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    assertEmbeddingRequest(request);
    const vector = this.vectorFor(request.text);
    assertEmbeddingVector(vector);
    return { vector, model: `${this.model}/${this.dimensions}` };
  }

  async embedMany(requests: EmbeddingRequest[]): Promise<EmbeddingResponse[]> {
    if (!Array.isArray(requests)) {
      throw new TypeError("embedMany expects an array of embedding requests");
    }
    const batch = clampEmbeddingBatch(requests.length);
    const working = requests.slice(0, batch);
    const results: EmbeddingResponse[] = [];
    for (const request of working) {
      results.push(await this.embed(request));
    }
    return results;
  }

  describe(): EmbeddingExport {
    return { providerId: this.providerId, dimensions: this.dimensions, description: "offline deterministic hashing" };
  }

  /** Internal helper producing a fresh, finite, fixed-width vector. */
  vectorFor(text: string): number[] {
    const width = this.dimensions;
    const vector = new Array<number>(width).fill(0);
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token !== "");
    for (const token of tokens) {
      const hash = fnv1a36(token);
      const [start, spread, weight] = nextBody(hash, width);
      vector[start] += weight;
      const second = (start + 1 + (spread % Math.max(1, width - 1))) % width;
      vector[second] += 1;
    }
    for (let index = 0; index < width; index += 1) {
      vector[index] = Number.isFinite(vector[index]) ? vector[index] : 0;
    }
    return vector;
  }
}

/** Shared capability description used by embeddings integration. */
export function maxEmbeddingTextChars(): number {
  return MEMORY_LIMITS.MAX_MEMORY_CONTENT_CHARS;
}