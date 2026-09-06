import { NextResponse } from "next/server";
import { modelRegistry } from "@/lib/research/models";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const providers = modelRegistry.allProviders();
  const items = q
    ? providers.filter((provider) =>
        [provider.id, provider.name, provider.description, provider.website]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
    : providers;

  return NextResponse.json({ count: items.length, items });
}