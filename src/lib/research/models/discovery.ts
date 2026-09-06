import { GitHubSourceAdapter } from "../github";
import type { GitHubRepository } from "../github";
import { listProviders } from "./providers";
import { modelRegistry } from "./registry";
import {
  computeRepoConfidence,
  rankDiscoveries,
  scoreDiscovery,
} from "./ranking";
import type {
  AIModel,
  AIModelCategory,
  AIModelDiscovery,
  AIProvider,
  DiscoveryKind,
  DiscoveryRunResult,
} from "./types";
import { CATEGORY_BY_DISCOVERY_KIND } from "./types";

const GITHUB_SEED_QUERIES: ReadonlyArray<{
  kind: DiscoveryKind;
  query: string;
  category: AIModelCategory;
}> = [
  {
    kind: "open-source-project",
    query: "new open source llm",
    category: "foundation",
  },
  {
    kind: "coding-model",
    query: "open source coding assistant llm",
    category: "coding",
  },
  {
    kind: "developer-tool",
    query: "ai developer tool cli",
    category: "other",
  },
  {
    kind: "infrastructure",
    query: "llm inference server",
    category: "other",
  },
];

const MAX_SEED_QUERIES = 4;
const REPOS_PER_QUERY = 5;

function nowISO(): string {
  return new Date().toISOString();
}

export function categoryOfKind(kind: DiscoveryKind): AIModelCategory {
  return CATEGORY_BY_DISCOVERY_KIND[kind];
}

export function buildModelFromRepo(
  repo: GitHubRepository,
  kind: DiscoveryKind,
  categoryOverride?: AIModelCategory
): AIModel {
  const category = categoryOverride ?? categoryOfKind(kind);
  const now = nowISO();
  return {
    id: `gh-${repo.fullName}`,
    name: repo.name,
    providerId: repo.owner.login,
    category,
    description: repo.description ?? undefined,
    modalities: [],
    access: "open-source",
    tags: repo.topics.slice(0, 8),
    sources: [
      {
        kind: "github",
        url: repo.htmlUrl,
        title: repo.fullName,
        retrievedAt: now,
      },
    ],
    confidence: computeRepoConfidence(repo),
    verified: false,
    firstSeenAt: now,
    updatedAt: now,
  };
}

export function buildDiscoveryFromRepo(
  repo: GitHubRepository,
  kind: DiscoveryKind,
  categoryOverride?: AIModelCategory
): AIModelDiscovery {
  const model = buildModelFromRepo(repo, kind, categoryOverride);
  const discovery: AIModelDiscovery = {
    id: `disc-${model.id}`,
    kind,
    title: repo.fullName,
    summary:
      repo.description ??
      `Open-source ${kind.replaceAll("-", " ")} repository by ${repo.owner.login}`,
    providerId: repo.owner.login,
    modelId: model.id,
    githubUrl: repo.htmlUrl,
    repositoryFullName: repo.fullName,
    repository: repo,
    score: 0,
    rank: 0,
    tags: repo.topics.slice(0, 8),
    sources: model.sources,
    confidence: model.confidence,
    discoveredAt: nowISO(),
  };
  discovery.score = scoreDiscovery(discovery);
  return discovery;
}

export function buildProviderDiscovery(provider: AIProvider): AIModelDiscovery {
  return {
    id: `prov-${provider.id}`,
    kind: "provider",
    title: provider.name,
    summary: provider.description,
    providerId: provider.id,
    githubUrl: provider.website,
    score: provider.verified ? 90 : 50,
    rank: 0,
    tags: ["ai-provider"],
    sources: provider.sources.map((site) => ({
      kind: site.kind,
      url: site.url,
      title: site.title,
      retrievedAt: nowISO(),
    })),
    confidence: provider.verified ? 1 : 0.5,
    discoveredAt: nowISO(),
  };
}

export function providerSeedDiscoveries(): AIModelDiscovery[] {
  return listProviders().map(buildProviderDiscovery);
}

function registerRepoOwner(repo: GitHubRepository): void {
  const existing = modelRegistry.getProvider(repo.owner.login);
  if (existing && existing.verified) return;
  modelRegistry.registerProvider({
    id: repo.owner.login,
    name: repo.owner.login,
    website: repo.owner.htmlUrl,
    description:
      "GitHub user or organization publishing open-source AI repositories.",
    sources: [
      {
        kind: "github",
        url: repo.owner.htmlUrl,
        title: repo.owner.login,
      },
    ],
    firstSeenAt: nowISO(),
    verified: false,
  });
}

export async function runModelDiscovery(
  input: {
    category?: AIModelCategory;
    limit?: number;
    enableGitHub?: boolean;
    githubQuery?: string;
  } = {}
): Promise<DiscoveryRunResult> {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const discoveries: AIModelDiscovery[] = providerSeedDiscoveries();
  const models: AIModel[] = [];
  const githubErrors: string[] = [];
  const seenRepos = new Set<string>();

  const rawQuery = typeof input.githubQuery === "string" ? input.githubQuery.trim() : "";
  const enableGitHub =
    input.enableGitHub === true || rawQuery.length > 0;

  if (enableGitHub) {
    const adapter = new GitHubSourceAdapter();
    const categoryFilter = input.category;
    const queries =
      rawQuery.length > 0
        ? [
            {
              kind: "model" as const,
              category: (categoryFilter ??
                "other") as AIModelCategory,
              query: rawQuery,
            },
          ]
        : GITHUB_SEED_QUERIES.filter(
            (seed) => !categoryFilter || seed.category === categoryFilter
          );

    for (const seed of queries.slice(0, MAX_SEED_QUERIES)) {
      try {
        const result = await adapter.searchRepositories(
          seed.query,
          REPOS_PER_QUERY
        );
        for (const repo of result.items) {
          if (seenRepos.has(repo.fullName) || repo.archived) continue;
          seenRepos.add(repo.fullName);

          const discovery = buildDiscoveryFromRepo(repo, seed.kind, seed.category);
          discoveries.push(discovery);

          if (seed.kind === "model" || seed.kind === "coding-model") {
            const model = buildModelFromRepo(repo, seed.kind, seed.category);
            models.push(model);
            modelRegistry.addModel(model);
          }

          registerRepoOwner(repo);
        }
      } catch (err) {
        githubErrors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  const ranked = rankDiscoveries(discoveries);
  const selected = ranked.slice(0, limit);
  for (const discovery of selected) {
    modelRegistry.addDiscovery(discovery);
  }

  return {
    count: selected.length,
    discoveries: selected,
    models,
    githubError: githubErrors.length > 0 ? githubErrors[0] : undefined,
    durationMs: Date.now() - startedAt,
  };
}