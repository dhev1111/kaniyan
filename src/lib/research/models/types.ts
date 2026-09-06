import type { GitHubRepository } from "../github/types";

export type AIModelCategory =
  | "foundation"
  | "coding"
  | "reasoning"
  | "agent"
  | "embedding"
  | "vision"
  | "speech"
  | "audio"
  | "image"
  | "video"
  | "infrastructure"
  | "other";

export type AIModelAccess = "open" | "api" | "open-source" | "unknown";

export type DiscoveryKind =
  | "model"
  | "provider"
  | "coding-model"
  | "open-source-project"
  | "developer-tool"
  | "infrastructure";

export const CATEGORY_BY_DISCOVERY_KIND: Record<DiscoveryKind, AIModelCategory> =
  {
    model: "other",
    provider: "other",
    "coding-model": "coding",
    "open-source-project": "foundation",
    "developer-tool": "other",
    infrastructure: "infrastructure",
  };

export type AIModelSourceKind =
  | "official"
  | "github"
  | "provider"
  | "release-notes"
  | "docs"
  | "user"
  | "other";

export interface AIModelSource {
  kind: AIModelSourceKind;
  url: string;
  title: string;
  retrievedAt: string;
}

export interface ModelCost {
  inputPerMillion?: number;
  outputPerMillion?: number;
  freeTier: boolean;
  notes?: string;
}

export interface AIModel {
  id: string;
  name: string;
  providerId: string;
  category: AIModelCategory;
  description?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  modalities: string[];
  apiModelId?: string;
  access: AIModelAccess;
  tags: string[];
  releasedAt?: string;
  cost?: ModelCost;
  sources: AIModelSource[];
  confidence: number;
  verified: boolean;
  firstSeenAt: string;
  updatedAt: string;
}

export interface AIProviderSite {
  kind: AIModelSourceKind;
  url: string;
  title: string;
}

export interface AIProvider {
  id: string;
  name: string;
  website: string;
  apiBaseUrl?: string;
  description: string;
  sources: AIProviderSite[];
  firstSeenAt: string;
  verified: boolean;
}

export interface AIModelDiscovery {
  id: string;
  kind: DiscoveryKind;
  title: string;
  summary: string;
  providerId?: string;
  modelId?: string;
  githubUrl?: string;
  repositoryFullName?: string;
  repository?: GitHubRepository;
  score: number;
  rank: number;
  tags: string[];
  sources: AIModelSource[];
  confidence: number;
  discoveredAt: string;
}

export interface DiscoveryRunResult {
  count: number;
  discoveries: AIModelDiscovery[];
  models: AIModel[];
  githubError?: string;
  durationMs: number;
}

export interface DiscoverySearchResult {
  total: number;
  items: AIModelDiscovery[];
  query?: string;
}