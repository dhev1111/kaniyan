import { NextResponse } from "next/server";
import {
  modelRegistry,
  parsePositiveInt,
  validateDiscoveryKind,
  validateModelCategory,
} from "@/lib/research/models";
import type {
  AIModelCategory,
  DiscoveryKind,
} from "@/lib/research/models";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = parsePositiveInt(searchParams.get("limit"), 20, 50);
  const kindRaw = searchParams.get("kind");
  const categoryRaw = searchParams.get("category");

  let kind: DiscoveryKind | undefined;
  if (kindRaw) {
    const validation = validateDiscoveryKind(kindRaw);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    kind = validation.value;
  }

  let category: AIModelCategory | undefined;
  if (categoryRaw) {
    const validation = validateModelCategory(categoryRaw);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    category = validation.value;
  }

  const items = modelRegistry.searchDiscoveries({
    query: q || undefined,
    kind,
    category,
    limit,
  });

  return NextResponse.json({
    total: items.length,
    items,
    query: q || undefined,
  });
}