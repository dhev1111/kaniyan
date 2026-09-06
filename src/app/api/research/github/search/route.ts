import { NextResponse } from "next/server";
import { GitHubSourceAdapter, GitHubError } from "@/lib/research/github";
import {
  parsePositiveInt,
  validateSearchQuery,
} from "@/lib/research/github";

const adapter = new GitHubSourceAdapter();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q");
  const perPage = parsePositiveInt(searchParams.get("per_page"), 10, 20);

  const validation = validateSearchQuery(rawQuery);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const result = await adapter.searchRepositories(
      validation.value,
      perPage
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GitHubError) {
      return NextResponse.json(
        { error: err.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "GitHub search failed" },
      { status: 502 }
    );
  }
}