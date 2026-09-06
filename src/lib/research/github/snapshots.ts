import type {
  GitHubRelease,
  GitHubRepository,
  GitHubRepositorySnapshot,
} from "./types";

const MAX_SNAPSHOTS = 200;

class GitHubSnapshotStoreImpl {
  private snapshots = new Map<string, GitHubRepositorySnapshot>();

  save(snapshot: GitHubRepositorySnapshot): void {
    if (this.snapshots.size >= MAX_SNAPSHOTS) {
      const oldest = this.snapshots.keys().next().value;
      if (oldest !== undefined) {
        this.snapshots.delete(oldest as string);
      }
    }
    this.snapshots.set(snapshot.fullName, snapshot);
  }

  get(fullName: string): GitHubRepositorySnapshot | undefined {
    return this.snapshots.get(fullName);
  }

  list(): GitHubRepositorySnapshot[] {
    return Array.from(this.snapshots.values())
      .sort(
        (a, b) =>
          new Date(b.retrievedAt).getTime() -
          new Date(a.retrievedAt).getTime()
      )
      .slice(0, 50);
  }

  clear(): void {
    this.snapshots.clear();
  }

  get size(): number {
    return this.snapshots.size;
  }
}

export function createRepositorySnapshot(
  repo: GitHubRepository,
  latestRelease?: GitHubRelease
): GitHubRepositorySnapshot {
  return {
    fullName: repo.fullName,
    stars: repo.stars,
    forks: repo.forks,
    openIssues: repo.openIssues,
    pushedAt: repo.pushedAt,
    latestRelease,
    retrievedAt: new Date().toISOString(),
  };
}

export const githubSnapshotStore = new GitHubSnapshotStoreImpl();