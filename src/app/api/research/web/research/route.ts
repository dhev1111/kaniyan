import { NextResponse } from "next/server";
import {
  parseLimit,
  parseUrlsPayload,
  recordWebResearchReport,
  runWebResearch,
  validateWebQuery,
} from "@/lib/research/web";
import { researchService } from "../../service";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const obj = (body ?? {}) as Record<string, unknown>;
  const queryResult = validateWebQuery(obj.query);
  if (!queryResult.ok) {
    return NextResponse.json({ error: queryResult.error }, { status: 400 });
  }

  const urls = parseUrlsPayload(obj.urls, 5).urls;
  const limit = parseLimit(obj.limit);

  const report = await runWebResearch({
    query: queryResult.value,
    urls,
    limit,
  });

  let recorded: unknown = null;
  if (report.sources.some((source) => source.status === "fetched")) {
    const integration = recordWebResearchReport(
      researchService,
      report
    );
    if (integration.success && integration.record) {
      recorded = {
        jobId: integration.record.jobId,
        runId: integration.record.runId,
        sourceCount: integration.record.sourceIds.length,
        findingCount: integration.record.findingIds.length,
      };
    }
  }

  return NextResponse.json({ report, recorded });
}