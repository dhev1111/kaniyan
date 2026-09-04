import { NextResponse } from "next/server";
import { researchService } from "../../service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = researchService.getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const runs = researchService.listRuns(id);
  const latestRun = runs[0];
  const sources = latestRun
    ? researchService.listSources(latestRun.id)
    : [];

  return NextResponse.json(sources);
}
