import { NextResponse } from "next/server";
import { runModelDiscovery, validateModelCategory } from "@/lib/research/models";
import type { AIModelCategory } from "@/lib/research/models";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const obj = (body ?? {}) as Record<string, unknown>;

  let category: AIModelCategory | undefined;
  if (
    obj.category !== undefined &&
    obj.category !== null &&
    obj.category !== ""
  ) {
    const validation = validateModelCategory(obj.category);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    category = validation.value;
  }

  const limit =
    typeof obj.limit === "number" && Number.isFinite(obj.limit)
      ? Math.min(Math.max(Math.round(obj.limit), 1), 50)
      : 20;
  const enableGitHub = obj.enableGitHub === true;
  const githubQuery =
    typeof obj.githubQuery === "string" ? obj.githubQuery : undefined;

  const result = await runModelDiscovery({
    category,
    limit,
    enableGitHub,
    githubQuery,
  });

  return NextResponse.json(result);
}