import type {
  ResearchSourceType,
  ResearchSource,
} from "../types";
import type {
  ResearchSourceAdapter,
  SourceSearchResult,
  SourceFetchResult,
} from "./types";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export class MockSourceAdapter implements ResearchSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly sourceType: ResearchSourceType;

  constructor(
    id: string,
    name: string,
    sourceType: ResearchSourceType = "web"
  ) {
    this.id = id;
    this.name = name;
    this.sourceType = sourceType;
  }

  async search(
    query: string,
    maxResults: number
  ): Promise<SourceSearchResult[]> {
    const count = Math.min(maxResults, 3);
    const results: SourceSearchResult[] = [];
    for (let i = 0; i < count; i++) {
      results.push({
        url: `https://mock-source.example.com/result/${i}`,
        title: `Mock Result ${i + 1} for "${query}"`,
        publisher: `Mock Publisher ${i + 1}`,
        sourceType: this.sourceType,
        snippet: `This is a mock search result snippet for query "${query}". No real data.`,
      });
    }
    return results;
  }

  async fetch(url: string): Promise<SourceFetchResult> {
    const sourceId = generateId();
    const source: ResearchSource = {
      id: sourceId,
      url,
      title: `Mock Page from ${url}`,
      sourceType: this.sourceType,
      publisher: "Mock Publisher",
      discoveredAt: nowISO(),
      accessedAt: nowISO(),
      reliability: "unknown",
      status: "accessed",
    };

    return {
      source,
      content: `Mock content fetched from ${url}. No real data was accessed.`,
    };
  }
}
