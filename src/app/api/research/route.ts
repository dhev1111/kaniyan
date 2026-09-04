import { NextResponse } from "next/server";
import { researchService } from "./service";
import type { ResearchPriority } from "@/lib/research/types";

export async function GET() {
  const jobs = researchService.listJobs();
  return NextResponse.json(jobs);
}

export async function POST(request: Request) {
  const body = await request.json();

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const projectId =
    typeof body.projectId === "string" ? body.projectId.trim() : "";
  const createdBy =
    typeof body.createdBy === "string" ? body.createdBy.trim() : "user";

  if (!title || !query || !projectId) {
    return NextResponse.json(
      { error: "title, query, and projectId are required" },
      { status: 400 }
    );
  }

  const validPriorities: ResearchPriority[] = [
    "low",
    "medium",
    "high",
    "critical",
  ];
  const priority = validPriorities.includes(body.priority)
    ? body.priority
    : "medium";

  const job = researchService.createJob({
    projectId,
    title,
    query,
    priority,
    createdBy,
  });

  return NextResponse.json(job, { status: 201 });
}
