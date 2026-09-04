import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json(store.getAllAgents());
}

export async function POST(request: Request) {
  const body = await request.json();
  const agent = store.createAgent(body);
  return NextResponse.json(agent, { status: 201 });
}
