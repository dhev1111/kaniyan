import { NextResponse } from "next/server";
import { GitHubSourceAdapter, GitHubError } from "@/lib/research/github";
import {
  parsePositiveInt,
  validateOwnerRepo,
} from "@/lib/research/github";

const adapter = new GitHubSourceAdapter();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const perPage = parsePositiveInt(searchParams.get("per_page"), 10, 20);

  const validation = validateOwnerRepo(owner, repo);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const releases = await adapter.getReleases(
      validation.value.owner,
      validation.value.repo,
      perPage
    );
    return NextResponse.json(releases);
  } catch (err) {
    if (err instanceof GitHubError) {
      return NextResponse.json(
        { error: err.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "GitHub releases request failed" },
      { status: 502 }
    );
  }
}