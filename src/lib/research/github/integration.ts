import type {
  ResearchFinding,
  ResearchRun,
  ResearchSource,
} from "../types";
import type { GitHubRepository, GitHubRepositorySnapshot } from "./types";
import { githubSnapshotStore } from "./snapshots";

export interface GitHubResearchRecord {
  jobId: string;
  runId: string;
  sourceId: string;
  findingId: string;
}

interface ResearchServiceLike {
  createJob(input: {
    projectId: string;
    title: string;
    query: string;
    priority?: "low" | "medium" | "high" | "critical";
    createdBy: string;
  }): { id: string };
  startRun(
    jobId: string
  ): { success: boolean; error?: string; run?: ResearchRun };
  addSource(
    runId: string,
    data: Omit<ResearchSource, "id" | "discoveredAt">
  ): { success: boolean; error?: string; source?: ResearchSource };
  addFinding(
    runId: string,
    data: Omit<ResearchFinding, "id" | "createdAt" | "runId">
  ): { success: boolean; error?: string; finding?: ResearchFinding };
  completeRun(runId: string): { success: boolean };
}

export function recordGitHubRepository(
  service: ResearchServiceLike,
  repo: GitHubRepository,
  snapshot?: GitHubRepositorySnapshot
): { success: boolean; error?: string; record?: GitHubResearchRecord } {
  const job = service.createJob({
    projectId: "github-research",
    title: repo.fullName,
    query: repo.description ?? `Research GitHub repository ${repo.fullName}`,
    priority: "medium",
    createdBy: "github-research",
  });

  const runResult = service.startRun(job.id);
  if (!runResult.success || !runResult.run) {
    return {
      success: false,
      error: runResult.error ?? "Failed to start research run",
    };
  }
  const runId = runResult.run.id;

  const sourceResult = service.addSource(runId, {
    url: repo.htmlUrl,
    title: repo.fullName,
    sourceType: "github",
    publisher: repo.owner.login,
    accessedAt: new Date().toISOString(),
    reliability: "high",
    status: "accessed",
  });
  if (!sourceResult.success || !sourceResult.source) {
    return {
      success: false,
      error: sourceResult.error ?? "Failed to record source",
    };
  }

  const findingResult = service.addFinding(runId, {
    sourceId: sourceResult.source.id,
    claim: `Repository "${repo.fullName}" metadata retrieved from GitHub`,
    evidence: JSON.stringify({
      description: repo.description,
      language: repo.language,
      stars: repo.stars,
      forks: repo.forks,
      openIssues: repo.openIssues,
      license: repo.license,
      pushedAt: repo.pushedAt,
      defaultBranch: repo.defaultBranch,
      topics: repo.topics,
      archived: repo.archived,
      snapshot: snapshot,
      retrievedAt: new Date().toISOString(),
    }),
    confidence: 0.8,
  });
  if (!findingResult.success || !findingResult.finding) {
    return {
      success: false,
      error: findingResult.error ?? "Failed to record finding",
    };
  }

  service.completeRun(runId);

  if (snapshot) {
    githubSnapshotStore.save(snapshot);
  }

  return {
    success: true,
    record: {
      jobId: job.id,
      runId,
      sourceId: sourceResult.source.id,
      findingId: findingResult.finding.id,
    },
  };
}