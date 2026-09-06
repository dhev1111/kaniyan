export interface GitHubOwner {
  id: number;
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  type: string;
}

export interface GitHubRepository {
  id: number;
  fullName: string;
  name: string;
  owner: GitHubOwner;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  license: string | null;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  archived: boolean;
  visibility: string;
}

export interface GitHubRelease {
  tagName: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  draft: boolean;
  htmlUrl: string;
}

export interface GitHubSearchQuery {
  query: string;
  perPage: number;
  page: number;
}

export interface GitHubSearchResult {
  totalCount: number;
  items: GitHubRepository[];
  page: number;
  perPage: number;
}

export interface GitHubRepositorySnapshot {
  fullName: string;
  stars: number;
  forks: number;
  openIssues: number;
  pushedAt: string;
  latestRelease?: GitHubRelease;
  retrievedAt: string;
}

export interface GitHubReadme {
  fullName: string;
  owner: string;
  repo: string;
  content: string;
  size: number;
  retrievedAt: string;
}