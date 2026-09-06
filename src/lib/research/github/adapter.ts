import type {
  ResearchSource,
  ResearchSourceType,
} from "../types";
import type {
  ResearchSourceAdapter,
  SourceSearchResult,
  SourceFetchResult,
} from "../adapters/types";
import type {
  GitHubRepository,
  GitHubReadme,
  GitHubRelease,
  GitHubSearchQuery,
  GitHubSearchResult,
} from "./types";
import { GitHubCache } from "./cache";
import {
  parseGitHubReleases,
  parseGitHubRepository,
  parseGitHubSearchResult,
} from "./parser";
import { parseGitHubUrl, validateSearchQuery } from "./validation";

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_JSON_RESPONSE_BYTES = 512 * 1024;
const MAX_README_BYTES = 512 * 1024;
const USER_AGENT = "kaniyan-research";

export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

export class GitHubHttpError extends GitHubError {
  readonly status: number;
  constructor(status: number) {
    super(`GitHub API error: HTTP ${status}`);
    this.name = "GitHubHttpError";
    this.status = status;
  }
}

export class GitHubRateLimitError extends GitHubError {
  readonly resetAt: number;
  constructor(resetAt: number) {
    super(
      `GitHub API rate limit exceeded (resets at ${new Date(resetAt).toISOString()})`
    );
    this.name = "GitHubRateLimitError";
    this.resetAt = resetAt;
  }
}

export class GitHubTimeoutError extends GitHubError {
  constructor() {
    super(`GitHub request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    this.name = "GitHubTimeoutError";
  }
}

export class GitHubParseError extends GitHubError {
  constructor() {
    super("GitHub API returned malformed JSON");
    this.name = "GitHubParseError";
  }
}

export class GitHubResponseTooLargeError extends GitHubError {
  constructor() {
    super("GitHub API response exceeded allowed size");
    this.name = "GitHubResponseTooLargeError";
  }
}

interface RequestOptions {
  params?: Record<string, string>;
  rawText?: boolean;
}

export class GitHubSourceAdapter implements ResearchSourceAdapter {
  readonly id = "github";
  readonly name = "GitHub";
  readonly sourceType: ResearchSourceType = "github";

  private readonly token: string | undefined;
  private readonly cache: GitHubCache;

  constructor(cache?: GitHubCache) {
    this.token = process.env.GITHUB_TOKEN
      ? (process.env.GITHUB_TOKEN as string).trim()
      : undefined;
    this.cache = cache ?? new GitHubCache();
  }

  get hasToken(): boolean {
    return !!this.token && this.token.length > 0;
  }

  private buildUrl(
    path: string,
    params: Record<string, string> = {}
  ): string {
    const url = new URL(GITHUB_API_BASE + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = this.buildUrl(path, options.params);

    const cached = this.cache.get(url);
    if (cached !== undefined) {
      return cached as T;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers: Record<string, string> = {
      Accept: options.rawText
        ? "application/vnd.github.raw+json"
        : "application/vnd.github+json",
      "User-Agent": USER_AGENT,
    };
    if (this.hasToken) {
      headers.Authorization = `Bearer ${this.token as string}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.name === "TimeoutError")
      ) {
        throw new GitHubTimeoutError();
      }
      throw new GitHubError(`GitHub request failed: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }

    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    if (rateLimitRemaining === "0") {
      const resetRaw = response.headers.get("x-ratelimit-reset");
      const resetAt = resetRaw ? Number(resetRaw) * 1000 : Date.now();
      throw new GitHubRateLimitError(resetAt);
    }

    if (!response.ok) {
      throw new GitHubHttpError(response.status);
    }

    const text = await response.text();
    if (text.length > MAX_JSON_RESPONSE_BYTES) {
      throw new GitHubResponseTooLargeError();
    }

    if (options.rawText) {
      const result = text as T;
      this.cache.set(url, result);
      return result;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new GitHubParseError();
    }

    this.cache.set(url, parsed);
    return parsed as T;
  }

  async searchRepositories(
    rawQuery: string,
    perPage: number
  ): Promise<GitHubSearchResult> {
    const validation = validateSearchQuery(rawQuery);
    if (!validation.ok) {
      throw new GitHubError(validation.error);
    }
    const query: GitHubSearchQuery = {
      query: validation.value,
      perPage,
      page: 1,
    };
    const raw = await this.request<Record<string, unknown>>(
      "/search/repositories",
      {
        params: {
          q: query.query,
          per_page: String(query.perPage),
          page: String(query.page),
        },
      }
    );
    return parseGitHubSearchResult(raw);
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);
    const raw = await this.request<Record<string, unknown>>(
      `/repos/${encodedOwner}/${encodedRepo}`
    );
    return parseGitHubRepository(raw);
  }

  async getReadme(owner: string, repo: string): Promise<GitHubReadme> {
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);
    const content = await this.request<string>(
      `/repos/${encodedOwner}/${encodedRepo}/readme`,
      { rawText: true }
    );
    if (content.length > MAX_README_BYTES) {
      throw new GitHubResponseTooLargeError();
    }
    return {
      fullName: `${owner}/${repo}`,
      owner,
      repo,
      content,
      size: content.length,
      retrievedAt: new Date().toISOString(),
    };
  }

  async getReleases(
    owner: string,
    repo: string,
    perPage = 10
  ): Promise<GitHubRelease[]> {
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);
    const raw = await this.request<unknown>(
      `/repos/${encodedOwner}/${encodedRepo}/releases`,
      { params: { per_page: String(perPage) } }
    );
    return parseGitHubReleases(raw);
  }

  async search(
    query: string,
    maxResults: number
  ): Promise<SourceSearchResult[]> {
    const result = await this.searchRepositories(query, maxResults);
    return result.items.map((repo) => ({
      url: repo.htmlUrl,
      title: repo.fullName,
      publisher: repo.owner.login,
      sourceType: "github" as const,
      snippet: repo.description ?? "",
    }));
  }

  async fetch(url: string): Promise<SourceFetchResult> {
    const validation = parseGitHubUrl(url);
    if (!validation.ok) {
      throw new GitHubError(validation.error);
    }

    const repo = await this.getRepository(
      validation.value.owner,
      validation.value.repo
    );

    const source: ResearchSource = {
      id: `${repo.id}`,
      url: repo.htmlUrl,
      title: repo.fullName,
      sourceType: "github",
      publisher: repo.owner.login,
      discoveredAt: new Date().toISOString(),
      accessedAt: new Date().toISOString(),
      reliability: "high",
      status: "accessed",
    };

    return {
      source,
      content: JSON.stringify(repo),
    };
  }
}