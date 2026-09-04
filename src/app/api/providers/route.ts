import { NextResponse } from "next/server";
import { providerManager } from "@/lib/llm";

export async function GET() {
  const providers = providerManager.getAllProviders().map((p) => ({
    id: p.id,
    displayName: p.displayName,
    isConfigured: p.isConfigured(),
  }));
  return NextResponse.json(providers);
}
