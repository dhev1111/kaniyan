import {
  CURATED_PROVIDERS,
  ModelRegistry,
  buildDiscoveryFromRepo,
  buildModelFromRepo,
  buildProviderDiscovery,
  categoryOfKind,
  computeRepoConfidence,
  findProvider,
  listProviders,
  modelRegistry,
  parseConfidence,
  parseModelCost,
  parseOptionalPositiveInt,
  parseSourcesPayload,
  providerSeedDiscoveries,
  rankDiscoveries,
  recordAIModelDiscovery,
  runModelDiscovery,
  scoreDiscovery,
  validateDiscoveryKind,
  validateModelAccess,
  validateModelCategory,
  validateName,
  validateSourceKind,
  validateUrl,
} from "@/lib/research/models";
import { InMemoryResearchRepository, ResearchService } from "@/lib/research";
import { parseGitHubRepository } from "@/lib/research/github";
import type { AIModel, AIModelDiscovery } from "@/lib/research/models";
import type { GitHubRepository } from "@/lib/research/github";

const REPO_JSON = {
  id: 123,
  full_name: "acme/fresh-coder",
  name: "fresh-coder",
  owner: {
    id: 1,
    login: "acme",
    avatar_url: "https://avatars.githubusercontent.com/u/1",
    html_url: "https://github.com/acme",
    type: "Organization",
  },
  description: "A new open-source AI coding assistant",
  html_url: "https://github.com/acme/fresh-coder",
  default_branch: "main",
  language: "Python",
  topics: ["llm", "coding-assistant"],
  stargazers_count: 1200,
  forks_count: 180,
  open_issues_count: 9,
  license: { spdx_id: "Apache-2.0" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  pushed_at: "2026-08-20T00:00:00Z",
  archived: false,
  visibility: "public",
};

function parseRepo(): GitHubRepository {
  return parseGitHubRepository(REPO_JSON);
}

function parseRepoJson(json: unknown): GitHubRepository {
  return parseGitHubRepository(json);
}

function mockGitHubSearch(items: unknown[]): void {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(JSON.stringify({ total_count: items.length, items }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

function makeRegisteredModel(): AIModel {
  return {
    id: "mo-test",
    name: "Example Model",
    providerId: "openai",
    category: "foundation",
    description: "A test model",
    modalities: ["text"],
    access: "api",
    tags: ["llm"],
    sources: [
      {
        kind: "official",
        url: "https://example.com/model",
        title: "Example docs",
        retrievedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    confidence: 0.8,
    verified: false,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  modelRegistry.clear();
});

describe("1. validation", () => {
  it("validates categories, access, kinds and source kinds", () => {
    expect(validateModelCategory("coding").ok).toBe(true);
    expect(validateModelCategory("not-a-category").ok).toBe(false);
    expect(validateModelAccess("open-source").ok).toBe(true);
    expect(validateModelAccess("paid").ok).toBe(false);
    expect(validateDiscoveryKind("coding-model").ok).toBe(true);
    expect(validateDiscoveryKind("bogus").ok).toBe(false);
    expect(validateSourceKind("github").ok).toBe(true);
    expect(validateSourceKind("bogus").ok).toBe(false);
  });

  it("validates names and urls", () => {
    expect(validateName("   ", "model name").ok).toBe(false);
    expect(validateName("Claude", "model name").ok).toBe(true);
    expect(validateUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateUrl("https://example.com/model").ok).toBe(true);
    expect(validateUrl("ftp://example.com").ok).toBe(false);
  });

  it("parses confidence, ints and cost safely", () => {
    expect(parseConfidence(2, 0.5)).toBe(1);
    expect(parseConfidence(-1, 0.5)).toBe(0);
    expect(parseConfidence(0.736, 0.5)).toBe(0.74);
    expect(parseConfidence("high", 0.5)).toBe(0.5);
    expect(parseOptionalPositiveInt(4096)).toBe(4096);
    expect(parseOptionalPositiveInt(0)).toBeUndefined();
    expect(parseOptionalPositiveInt("x")).toBeUndefined();

    const cost = parseModelCost({
      inputPerMillion: 3,
      outputPerMillion: 15,
      freeTier: true,
      notes: "test",
    });
    expect(cost?.inputPerMillion).toBe(3);
    expect(cost?.freeTier).toBe(true);
    expect(parseModelCost(null)).toBeUndefined();
    expect(parseModelCost({ freeTier: false })?.inputPerMillion).toBeUndefined();
  });

  it("requires at least one valid http(s) source", () => {
    const fallback = parseSourcesPayload({
      sourceUrl: "https://example.com/model",
      sourceKind: "official",
      sourceTitle: "Docs",
    });
    expect(fallback.ok).toBe(true);
    if (fallback.ok) {
      expect(fallback.value[0].kind).toBe("official");
      expect(fallback.value[0].title).toBe("Docs");
    }

    const arraySources = parseSourcesPayload({
      sources: [
        { url: "https://example.com/a", kind: "docs", title: "A" },
        { url: "javascript:x", kind: "github", title: "bad" },
        { url: 42, kind: "github", title: "bad" },
      ],
    });
    expect(arraySources.ok).toBe(true);
    if (arraySources.ok) expect(arraySources.value.length).toBe(1);

    expect(parseSourcesPayload({}).ok).toBe(false);
  });
});

describe("2. curated providers", () => {
  it("includes known providers with verified provenance", () => {
    const openai = findProvider("OpenAI");
    expect(openai?.id).toBe("openai");
    expect(openai?.verified).toBe(true);
    expect(openai?.sources.length).toBeGreaterThan(0);
    expect(openai?.website).toContain("https://");
  });

  it("filters providers by query", () => {
    const matches = listProviders("cloud");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((p) => !p.verified)).toBe(false);
  });

  it("marks curated providers as verified", () => {
    expect(CURATED_PROVIDERS.every((p) => p.verified)).toBe(true);
  });
});

describe("3. ranking", () => {
  it("computes bounded repo confidence", () => {
    const repo = parseRepo();
    const confidence = computeRepoConfidence(repo);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it("scores recent high-star repos above stale low-star ones", () => {
    const fresh = buildDiscoveryFromRepo(parseRepo(), "coding-model");
    const stale = buildDiscoveryFromRepo(
      parseRepoJson({
        ...REPO_JSON,
        id: 999,
        stargazers_count: 3,
        forks_count: 1,
        pushed_at: "2020-01-01T00:00:00Z",
        full_name: "acme/old",
        html_url: "https://github.com/acme/old",
      }),
      "coding-model"
    );
    expect(scoreDiscovery(fresh)).toBeGreaterThan(scoreDiscovery(stale));
  });

  it("assigns sequential ranks sorted by score", () => {
    const a = {
      ...buildDiscoveryFromRepo(parseRepo(), "coding-model"),
      score: 10,
    };
    const b = {
      ...buildProviderDiscovery(CURATED_PROVIDERS[0]),
      score: 90,
    };
    const ranked = rankDiscoveries([a, b]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].title).toBe(b.title);
    expect(ranked[1].rank).toBe(2);
  });
});

describe("4. provider seeds and discovery engine", () => {
  it("seeds one high-confidence discovery per curated provider", () => {
    const seeds = providerSeedDiscoveries();
    expect(seeds.length).toBe(CURATED_PROVIDERS.length);
    expect(seeds.every((d) => d.kind === "provider")).toBe(true);
    expect(seeds.every((d) => d.confidence === 1)).toBe(true);
  });

  it("ranks provider seeds only when GitHub is disabled", async () => {
    const result = await runModelDiscovery({ enableGitHub: false });
    expect(result.count).toBe(CURATED_PROVIDERS.length);
    expect(result.models.length).toBe(0);
    expect(result.githubError).toBeUndefined();
    expect(result.discoveries.every((d) => d.kind === "provider")).toBe(true);
    expect(modelRegistry.discoveryCount).toBeGreaterThan(0);
  });

  it("adds repository discoveries and models when GitHub is enabled", async () => {
    mockGitHubSearch([REPO_JSON]);
    const result = await runModelDiscovery({
      enableGitHub: true,
      githubQuery: "coding assistant",
    });
    expect(result.githubError).toBeUndefined();
    const repoDiscovery = result.discoveries.find(
      (d) => d.kind === "coding-model" || d.kind === "model"
    );
    expect(repoDiscovery?.repositoryFullName).toBe("acme/fresh-coder");

    const model = result.models.find((m) => m.name === "fresh-coder");
    expect(model?.access).toBe("open-source");
    expect(model?.confidence).toBeGreaterThan(0);
    expect(model?.releasedAt).toBeUndefined();
    expect(modelRegistry.getModel("gh-acme/fresh-coder")).toBeDefined();
  });

  it("degrades gracefully when GitHub is unavailable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    const result = await runModelDiscovery({ enableGitHub: true });
    expect(result.githubError).toBeDefined();
    expect(result.count).toBeGreaterThan(0);
    expect(result.discoveries.some((d) => d.kind === "provider")).toBe(true);
  });

  it("maps discovery kinds to categories", () => {
    expect(categoryOfKind("coding-model")).toBe("coding");
    expect(categoryOfKind("infrastructure")).toBe("infrastructure");
  });
});

describe("5. registry", () => {
  it("stores, lists and searches models", () => {
    const registry = new ModelRegistry();
    registry.addModel(makeRegisteredModel());
    expect(registry.listModels().length).toBe(1);
    expect(registry.searchModels({ query: "example" }).length).toBe(1);
    expect(
      registry.searchModels({ query: "example", category: "coding" }).length
    ).toBe(0);
    expect(registry.searchModels({ query: "nope" }).length).toBe(0);
  });

  it("stores and searches discoveries by kind and category", () => {
    const registry = new ModelRegistry();
    const discovery = buildDiscoveryFromRepo(parseRepo(), "coding-model");
    registry.addDiscovery(discovery);
    expect(registry.searchDiscoveries({ kind: "coding-model" }).length).toBe(1);
    expect(registry.searchDiscoveries({ category: "coding" }).length).toBe(1);
    expect(registry.searchDiscoveries({ query: "fresh" }).length).toBe(1);
    expect(registry.searchDiscoveries({ query: "zzz" }).length).toBe(0);
  });

  it("merges registered providers with curated ones", () => {
    const registry = new ModelRegistry();
    registry.registerProvider({
      id: "new-lab",
      name: "New Lab",
      website: "https://example.com",
      description: "",
      sources: [{ kind: "user", url: "https://example.com", title: "New Lab" }],
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      verified: false,
    });
    const all = registry.allProviders();
    expect(all.some((p) => p.id === "openai")).toBe(true);
    expect(all.some((p) => p.id === "new-lab")).toBe(true);
    expect(registry.getProvider("new-lab")?.verified).toBe(false);
  });

  it("bounds model and discovery counts", () => {
    const registry = new ModelRegistry();
    for (let i = 0; i < 205; i++) {
      registry.addModel({
        ...makeRegisteredModel(),
        id: `mo-${i}`,
        name: `model-${i}`,
      });
    }
    expect(registry.modelCount).toBeLessThanOrEqual(200);

    const discoveryBase = buildDiscoveryFromRepo(parseRepo(), "coding-model");
    for (let i = 0; i < 305; i++) {
      registry.addDiscovery({ ...discoveryBase, id: `disc-${i}` });
    }
    expect(registry.discoveryCount).toBeLessThanOrEqual(300);
  });
});

describe("6. integration with the research pipeline", () => {
  it("records a model as a completed research job with provenance", () => {
    const repository = new InMemoryResearchRepository();
    const service = new ResearchService(repository);
    const model = makeRegisteredModel();
    const result = recordAIModelDiscovery(service, model);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const record = result.record!;
    const job = service.getJob(record.jobId);
    expect(job?.status).toBe("completed");

    const findings = service.listFindings(record.runId);
    expect(findings.length).toBe(1);
    expect(findings[0].claim).toContain("Example Model");
    const evidence = JSON.parse(findings[0].evidence) as {
      confidence: number;
      sources: Array<{ url: string }>;
    };
    expect(evidence.confidence).toBe(0.8);
    expect(evidence.sources[0].url).toBe("https://example.com/model");
  });

  it("rejects a model without a source url", () => {
    const repository = new InMemoryResearchRepository();
    const service = new ResearchService(repository);
    const model = { ...makeRegisteredModel(), sources: [] };
    const result = recordAIModelDiscovery(service, model);
    expect(result.success).toBe(false);
  });

  it("records a discovery alongside the model evidence", () => {
    const repository = new InMemoryResearchRepository();
    const service = new ResearchService(repository);
    const model = makeRegisteredModel();
    const discovery: AIModelDiscovery = buildProviderDiscovery(
      CURATED_PROVIDERS[0]
    );
    const result = recordAIModelDiscovery(service, model, discovery);
    expect(result.success).toBe(true);
  });
});

describe("7. buildModelFromRepo never invents facts", () => {
  it("maps metadata but leaves capability claims empty", () => {
    const repo = parseRepo();
    const model = buildModelFromRepo(repo, "coding-model", "coding");
    expect(model.name).toBe("fresh-coder");
    expect(model.providerId).toBe("acme");
    expect(model.category).toBe("coding");
    expect(model.modalities).toEqual([]);
    expect(model.releasedAt).toBeUndefined();
    expect(model.contextWindow).toBeUndefined();
    expect(model.cost).toBeUndefined();
    expect(model.confidence).toBeGreaterThan(0);
    expect(model.confidence).toBeLessThanOrEqual(1);
  });

  it("builds a discovery with score and provenance", () => {
    const repo = parseRepo();
    const discovery = buildDiscoveryFromRepo(repo, "open-source-project");
    expect(discovery.repositoryFullName).toBe("acme/fresh-coder");
    expect(discovery.sources[0].kind).toBe("github");
    expect(discovery.score).toBeGreaterThan(0);
    expect(discovery.score).toBeLessThanOrEqual(100);
  });
});