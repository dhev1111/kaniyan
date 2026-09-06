import { NextResponse } from "next/server";
import { researchService } from "../../service";
import {
  GitHubSourceAdapter,
  recordGitHubRepository,
  parseGitHubRepository,
  createRepositorySnapshot,
} from "@/lib/research/github";

const adapter = new GitHubSourceAdapter();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const repo = parseGitHubRepository(body);
  if (!repo.fullName) {
    return NextResponse.json(
      { error: "repository fullName is required" },
      { status: 400 }
    );
  }

  let snapshot;
  try {
    const [owner, repoName] = repo.fullName.split("/");
    const releases = await adapter.getReleases(owner, repoName, 1);
    snapshot = createRepositorySnapshot(repo, releases[0]);
  } catch {
    snapshot = createRepositorySnapshot(repo);
  }

  const result = recordGitHubRepository(researchService, repo, snapshot);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to record repository" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ...result.record, snapshot },
    { status: 201 }
  );
}