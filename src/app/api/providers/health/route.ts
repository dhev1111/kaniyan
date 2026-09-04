import { NextResponse } from "next/server";
import { providerManager } from "@/lib/llm";

export async function GET() {
  const health = await providerManager.healthCheckAll();
  return NextResponse.json(health);
}
