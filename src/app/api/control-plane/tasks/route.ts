import { NextResponse } from "next/server";
import { orchestrator } from "@/lib/control-plane";

export async function GET() {
  const tasks = orchestrator
    .getAllRuns()
    .map((r) => ({
      id: r.id,
      taskId: r.taskDefinitionId,
      agentInstanceId: r.agentInstanceId,
      state: r.state,
      attemptNumber: r.attemptNumber,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      durationMs: r.durationMs,
    }));
  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const body = await request.json();
  const task = orchestrator.submitTask({
    projectId: body.projectId,
    title: body.title,
    description: body.description,
    priority: body.priority ?? "medium",
    input: body.input,
    maxRetries: body.maxRetries ?? 3,
    dependencies: body.dependencies ?? [],
  });
  return NextResponse.json(task, { status: 201 });
}
