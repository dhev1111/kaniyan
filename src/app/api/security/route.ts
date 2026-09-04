import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json(store.getSecurityPolicy());
}

export async function PUT(request: Request) {
  const body = await request.json();
  const policy = store.updateSecurityPolicy(body);
  return NextResponse.json(policy);
}
