import { NextResponse } from "next/server";
import { modelRegistry } from "@/lib/llm";

export async function GET() {
  return NextResponse.json(modelRegistry.getAllModels());
}
