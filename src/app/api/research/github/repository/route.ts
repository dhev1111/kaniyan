import { NextResponse } from "next/server";
import { GitHubSourceAdapter, GitHubError } from "@/lib/research/github";
import { validateOwnerRepo } from "@/lib/research/github";

const adapter = new GitHubSourceAdapter();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  const validation = validateOwnerRepo(owner, repo);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const repository = await adapter.getRepository(
      validation.value.owner,
      validation.value.repo
    );
    return NextResponse.json(repository);
  } catch (err) {
    if (err instanceof GitHubError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.name === "GitHubHttpError" ? 404 : 502 }
      );
    }
    return NextResponse.json(
      { error: "GitHub request failed" },
      { status: 502 }
    );
  }
}