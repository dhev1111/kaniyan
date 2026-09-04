import type { ResearchSourceType, ResearchSource } from "../types";

export interface SourceSearchResult {
  url: string;
  title: string;
  publisher: string;
  sourceType: ResearchSourceType;
  snippet: string;
}

export interface SourceFetchResult {
  source: ResearchSource;
  content: string;
}

export interface ResearchSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly sourceType: ResearchSourceType;

  search(query: string, maxResults: number): Promise<SourceSearchResult[]>;
  fetch(url: string): Promise<SourceFetchResult>;
}
