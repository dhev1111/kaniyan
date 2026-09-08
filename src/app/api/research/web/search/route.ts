import { NextResponse } from "next/server";
import {
  parsePositiveInt,
  searchWithConfiguredProvider,
  validateWebQuery,
} from "@/lib/research/web";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";
  const queryResult = validateWebQuery(rawQuery);
  if (!queryResult.ok) {
    return NextResponse.json({ error: queryResult.error }, { status: 400 });
  }

  const limit = parsePositiveInt(searchParams.get("limit"), 5, 20);
  const attempt = await searchWithConfiguredProvider(queryResult.value, limit);

  if (!attempt.available) {
    return NextResponse.json({
      ok: false,
      available: false,
      error:
        "Web search provider is not configured (set KANIYAN_WEB_SEARCH_URL). Use the research endpoint with https source URLs instead.",
      results: [],
    });
  }

  if (attempt.error) {
    return NextResponse.json({
      ok: false,
      available: true,
      error: attempt.error,
      results: [],
    });
  }

  return NextResponse.json({
    ok: true,
    available: true,
    query: queryResult.value,
    total: attempt.results.length,
    results: attempt.results,
  });
}