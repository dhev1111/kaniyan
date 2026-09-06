import {
  GitHubSourceAdapter,
  GitHubCache,
  GitHubError,
  GitHubHttpError,
  GitHubRateLimitError,
  GitHubTimeoutError,
  GitHubParseError,
  GitHubResponseTooLargeError,
  parseGitHubRepository,
  parseGitHubSearchResult,
  parseGitHubReleases,
  createRepositorySnapshot,
  githubSnapshotStore,
  recordGitHubRepository,
} from "@/lib/research/github";
import {
  validateSearchQuery,
  validateOwnerRepo,
  parseGitHubUrl,
} from "@/lib/research/github";
import {
  InMemoryResearchRepository,
  ResearchService,
} from "@/lib/research";

const REPO_JSON = {
  id: 123,
  full_name: "octocat/Hello-World",
  name: "Hello-World",
  owner: {
    id: 1,
    login: "octocat",
    avatar_url: "https://avatars.githubusercontent.com/u/1",
    html_url: "https://github.com/octocat",
    type: "User",
  },
  description: "My first repository",
  html_url: "https://github.com/octocat/Hello-World",
  default_branch: "main",
  language: "JavaScript",
  topics: ["js", "demo"],
  stargazers_count: 100,
  forks_count: 20,
  open_issues_count: 5,
  license: { spdx_id: "MIT" },
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2021-01-01T00:00:00Z",
  pushed_at: "2021-02-01T00:00:00Z",
  archived: false,
  visibility: "public",
};

const RELEASE_JSON = {
  tag_name: "v1.0.0",
  name: "Version 1.0.0",
  published_at: "2021-01-01T00:00:00Z",
  prerelease: false,
  draft: false,
  html_url: "https://github.com/octocat/Hello-World/releases/tag/v1.0.0",
};

function mockFetchResponse({
  status = 200,
  body = "",
  headers = {},
}: {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}): void {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  global.fetch = jest.fn().mockResolvedValue(
    new Response(text, {
      status,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    })
  ) as unknown as typeof fetch;
}

function makeAdapter() {
  const cache = new GitHubCache(100, 60_000);
  const adapter = new GitHubSourceAdapter(cache);
  return { adapter, cache };
}

afterEach(() => {
  jest.restoreAllMocks();
  githubSnapshotStore.clear();
  delete process.env.GITHUB_TOKEN;
});

describe("1. GitHub query validation", () => {
  it("accepts a valid search query", () => {
    const result = validateSearchQuery("react hooks");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("react hooks");
  });

  it("rejects an empty query", () => {
    const result = validateSearchQuery("   ");
    expect(result.ok).toBe(false);
  });

  it("rejects an overly long query", () => {
    const result = validateSearchQuery("a".repeat(200));
    expect(result.ok).toBe(false);
  });

  it("validates owner and repo names", () => {
    expect(validateOwnerRepo("octocat", "Hello-World").ok).toBe(true);
    expect(validateOwnerRepo("invalid owner!", "repo").ok).toBe(false);
    expect(validateOwnerRepo("octocat", "bad repo/").ok).toBe(false);
  });
});

describe("2. Repository response parsing", () => {
  it("parses a repository payload", () => {
    const repo = parseGitHubRepository(REPO_JSON);
    expect(repo.fullName).toBe("octocat/Hello-World");
    expect(repo.stars).toBe(100);
    expect(repo.forks).toBe(20);
    expect(repo.openIssues).toBe(5);
    expect(repo.license).toBe("MIT");
    expect(repo.language).toBe("JavaScript");
    expect(repo.topics).toEqual(["js", "demo"]);
  });

  it("handles missing/optional fields safely", () => {
    const repo = parseGitHubRepository({ full_name: "a/b" });
    expect(repo.fullName).toBe("a/b");
    expect(repo.stars).toBe(0);
    expect(repo.description).toBeNull();
    expect(repo.topics).toEqual([]);
  });

  it("tolerates null owner", () => {
    const repo = parseGitHubRepository({ full_name: "a/b", owner: null });
    expect(repo.owner.login).toBe("");
  });
});

describe("3. README parsing", () => {
  it("fetches and returns README text", async () => {
    mockFetchResponse({ body: "# Hello World\nSome docs." });
    const { adapter } = makeAdapter();
    const readme = await adapter.getReadme("octocat", "Hello-World");
    expect(readme.content).toContain("Hello World");
    expect(readme.owner).toBe("octocat");
  });
});

describe("4. Release parsing", () => {
  it("parses releases array", async () => {
    mockFetchResponse({ body: [RELEASE_JSON] });
    const { adapter } = makeAdapter();
    const releases = await adapter.getReleases("octocat", "Hello-World");
    expect(releases.length).toBe(1);
    expect(releases[0].tagName).toBe("v1.0.0");
    expect(releases[0].htmlUrl).toContain("releases/tag");
  });
});

describe("5. Search result parsing", () => {
  it("parses search results", async () => {
    mockFetchResponse({
      body: { total_count: 1, items: [REPO_JSON] },
    });
    const { adapter } = makeAdapter();
    const result = await adapter.searchRepositories("hello", 10);
    expect(result.totalCount).toBe(1);
    expect(result.items.length).toBe(1);
    expect(result.items[0].fullName).toBe("octocat/Hello-World");
  });
});

describe("6. HTTP error handling", () => {
  it("throws GitHubHttpError on non-2xx", async () => {
    mockFetchResponse({ status: 404, body: { message: "Not Found" } });
    const { adapter } = makeAdapter();
    await expect(
      adapter.getRepository("octocat", "missing")
    ).rejects.toThrow(GitHubHttpError);
  });

  it("throws GitHubRateLimitError when rate limited", async () => {
    mockFetchResponse({
      status: 200,
      body: REPO_JSON,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1600000000" },
    });
    const { adapter } = makeAdapter();
    await expect(
      adapter.getRepository("octocat", "Hello-World")
    ).rejects.toThrow(GitHubRateLimitError);
  });
});

describe("7. Timeout handling", () => {
  it("throws GitHubTimeoutError when fetch aborts", async () => {
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    ) as unknown as typeof fetch;
    const { adapter } = makeAdapter();
    await expect(
      adapter.getRepository("octocat", "Hello-World")
    ).rejects.toThrow(GitHubTimeoutError);
  });
});

describe("8. Cache behavior", () => {
  it("serves cached responses and avoids duplicate requests", async () => {
    let calls = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      calls++;
      return new Response(JSON.stringify(REPO_JSON), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const { adapter } = makeAdapter();
    await adapter.getRepository("octocat", "Hello-World");
    await adapter.getRepository("octocat", "Hello-World");
    expect(calls).toBe(1);
  });

  it("bounds cache size by evicting oldest entries", () => {
    const cache = new GitHubCache(3, 60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4);
    expect(cache.size).toBe(3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("d")).toBe(4);
  });
});

describe("9. Malformed response handling", () => {
  it("throws GitHubParseError on invalid JSON", async () => {
    mockFetchResponse({ body: "not-json{{{" });
    const { adapter } = makeAdapter();
    await expect(
      adapter.getRepository("octocat", "Hello-World")
    ).rejects.toThrow(GitHubParseError);
  });

  it("throws GitHubResponseTooLargeError for oversized responses", async () => {
    mockFetchResponse({ body: "x".repeat(600 * 1024) });
    const { adapter } = makeAdapter();
    await expect(
      adapter.getRepository("octocat", "Hello-World")
    ).rejects.toThrow(GitHubResponseTooLargeError);
  });
});

describe("10. Token is never returned", () => {
  it("does not expose the token", async () => {
    process.env.GITHUB_TOKEN = "secret-token-value";
    const actualHeaders: Record<string, string> = {};
    global.fetch = jest.fn().mockImplementation(async (_url, init) => {
      Object.assign(actualHeaders, init?.headers);
      return new Response(JSON.stringify(REPO_JSON), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const { adapter } = makeAdapter();
    const repo = await adapter.getRepository("octocat", "Hello-World");
    expect(JSON.stringify(repo)).not.toContain("secret-token-value");
    expect(actualHeaders.Authorization).toBe("Bearer secret-token-value");
  });

  it("reports hasToken correctly but never leaks the value", () => {
    process.env.GITHUB_TOKEN = "abc123";
    const { adapter } = makeAdapter();
    expect(adapter.hasToken).toBe(true);
    expect(String(adapter)).not.toContain("abc123");
  });
});

describe("11. Research source creation", () => {
  it("creates a source for a discovered repository", async () => {
    const repo = parseGitHubRepository(REPO_JSON);
    const { adapter } = makeAdapter();
    const result = await adapter.fetch(repo.htmlUrl);
    expect(result.source.title).toBe("octocat/Hello-World");
    expect(result.source.sourceType).toBe("github");
    expect(result.source.reliability).toBe("high");
  });
});

describe("12. Research finding creation", () => {
  it("records a repository as a research source and finding", async () => {
    const repo = parseGitHubRepository(REPO_JSON);
    const snapshot = createRepositorySnapshot(repo);

    const repository = new InMemoryResearchRepository();
    const service = new ResearchService(repository);
    const result = recordGitHubRepository(service, repo, snapshot);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const record = result.record!;
    const job = service.getJob(record.jobId);
    expect(job?.status).toBe("completed");
    const runs = service.listRuns(record.jobId);
    expect(runs.length).toBeGreaterThan(0);
    const findings = service.listFindings(record.runId);
    expect(findings.length).toBe(1);
    expect(findings[0].claim).toContain(repo.fullName);
    expect(githubSnapshotStore.get("octocat/Hello-World")).toBeDefined();
  });

  it("does not invent facts when a repository record is empty", () => {
    const repository = new InMemoryResearchRepository();
    const service = new ResearchService(repository);
    const emptyRepo = parseGitHubRepository({ full_name: "a/b" });
    const result = recordGitHubRepository(service, emptyRepo);
    expect(result.success).toBe(true);
  });
});

describe("GitHub URL validation", () => {
  it("parses a valid github.com URL", () => {
    const result = parseGitHubUrl("https://github.com/octocat/Hello-World");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.owner).toBe("octocat");
      expect(result.value.repo).toBe("Hello-World");
    }
  });

  it("rejects non-github URLs", () => {
    expect(parseGitHubUrl("https://example.com/evil").ok).toBe(false);
  });
});

describe("Adapter implements the ResearchSourceAdapter interface", () => {
  it("provides a valid search result shape", async () => {
    mockFetchResponse({ body: { total_count: 1, items: [REPO_JSON] } });
    const { adapter } = makeAdapter();
    const results = await adapter.search("hello", 5);
    expect(results[0].url).toBe("https://github.com/octocat/Hello-World");
    expect(results[0].sourceType).toBe("github");
    expect(results[0].publisher).toBe("octocat");
  });
});
