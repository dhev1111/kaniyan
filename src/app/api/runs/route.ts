import { NextResponse } from "next/server";
import { orchestrator } from "@/lib/control-plane";

export async function GET() {
  const tasks = orchestrator
    .getAllRuns()
    .map((r) => ({
      ...r,
      task: undefined,
      agent: undefined,
    }));
  return NextResponse.json(tasks);
}
