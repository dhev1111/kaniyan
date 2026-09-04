import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json(store.getAllProjects());
}

export async function POST(request: Request) {
  const body = await request.json();
  const project = store.createProject(body);
  return NextResponse.json(project, { status: 201 });
}
