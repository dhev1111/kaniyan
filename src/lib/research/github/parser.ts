import type {
  GitHubOwner,
  GitHubRepository,
  GitHubRelease,
  GitHubSearchResult,
} from "./types";

function str(
  obj: Record<string, unknown>,
  key: string,
  fallback = ""
): string {
  const v = obj[key];
  return typeof v === "string" ? v : fallback;
}

function optStr(
  obj: Record<string, unknown>,
  key: string
): string | null {
  const v = obj[key];
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return null;
  return String(v);
}

function num(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function bool(obj: Record<string, unknown>, key: string): boolean {
  return obj[key] === true;
}

function ownerOf(raw: unknown): GitHubOwner {
  const owner = (raw ?? {}) as Record<string, unknown>;
  return {
    id: num(owner, "id"),
    login: str(owner, "login"),
    avatarUrl: str(owner, "avatar_url"),
    htmlUrl: str(owner, "html_url"),
    type: str(owner, "type"),
  };
}

function licenseOf(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return raw;
  const obj = raw as Record<string, unknown>;
  return optStr(obj, "spdx_id");
}

export function parseGitHubRepository(raw: unknown): GitHubRepository {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    id: num(obj, "id"),
    fullName: str(obj, "full_name"),
    name: str(obj, "name"),
    owner: ownerOf(obj["owner"]),
    description: optStr(obj, "description"),
    htmlUrl: str(obj, "html_url"),
    defaultBranch: str(obj, "default_branch"),
    language: optStr(obj, "language"),
    topics: Array.isArray(obj["topics"])
      ? (obj["topics"] as unknown[]).filter(
          (t): t is string => typeof t === "string"
        )
      : [],
    stars: num(obj, "stargazers_count"),
    forks: num(obj, "forks_count"),
    openIssues: num(obj, "open_issues_count"),
    license: licenseOf(obj["license"]),
    createdAt: str(obj, "created_at"),
    updatedAt: str(obj, "updated_at"),
    pushedAt: str(obj, "pushed_at"),
    archived: bool(obj, "archived"),
    visibility: str(obj, "visibility", "public"),
  };
}

export function parseGitHubSearchResult(raw: unknown): GitHubSearchResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const itemsRaw = obj["items"];
  const items = Array.isArray(itemsRaw)
    ? itemsRaw.map(parseGitHubRepository)
    : [];
  return {
    totalCount: num(obj, "total_count"),
    items,
    page: num(obj, "page") || 1,
    perPage: num(obj, "per_page") || items.length,
  };
}

export function parseGitHubRelease(raw: unknown): GitHubRelease {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    tagName: str(obj, "tag_name"),
    name: str(obj, "name"),
    publishedAt: str(obj, "published_at"),
    prerelease: bool(obj, "prerelease"),
    draft: bool(obj, "draft"),
    htmlUrl: str(obj, "html_url"),
  };
}

export function parseGitHubReleases(raw: unknown): GitHubRelease[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseGitHubRelease);
}