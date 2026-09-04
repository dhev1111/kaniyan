import { NextResponse } from "next/server";
import { researchService } from "../../service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = researchService.cancelJob(id);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Unable to cancel job" },
      { status: 400 }
    );
  }
  return NextResponse.json(result);
}
