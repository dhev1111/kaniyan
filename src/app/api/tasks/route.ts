import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json(store.getAllTasks());
}

export async function POST(request: Request) {
  const body = await request.json();
  const task = store.createTask(body);
  return NextResponse.json(task, { status: 201 });
}
