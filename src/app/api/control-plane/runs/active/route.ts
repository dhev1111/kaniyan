import { NextResponse } from "next/server";
import { orchestrator } from "@/lib/control-plane";

export async function GET() {
  const tasks = orchestrator
    .getAllRuns()
    .filter((r) => r.state === "running" || r.state === "pending");
  return NextResponse.json(tasks);
}
