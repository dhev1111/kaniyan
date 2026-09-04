import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/control-plane";

export async function GET() {
  return NextResponse.json(agentRegistry.getAllInstances());
}

export async function POST(request: Request) {
  const body = await request.json();
  const instance = agentRegistry.spawnInstance(
    body.definitionId,
    body.projectId
  );
  if (!instance) {
    return NextResponse.json(
      { error: "Failed to spawn agent instance" },
      { status: 400 }
    );
  }
  return NextResponse.json(instance, { status: 201 });
}
