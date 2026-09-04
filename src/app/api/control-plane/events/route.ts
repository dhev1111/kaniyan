import { NextResponse } from "next/server";
import { eventBus } from "@/lib/control-plane";

export async function GET() {
  return NextResponse.json(eventBus.getEvents(50));
}
