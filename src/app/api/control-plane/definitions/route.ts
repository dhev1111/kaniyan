import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/control-plane";

export async function GET() {
  return NextResponse.json(agentRegistry.getAllDefinitions());
}

export async function POST(request: Request) {
  const body = await request.json();
  const definition = agentRegistry.registerDefinition(body);
  return NextResponse.json(definition, { status: 201 });
}
