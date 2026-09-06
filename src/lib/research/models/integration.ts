import type {
  ResearchFinding,
  ResearchRun,
  ResearchSource,
} from "../types";
import type { AIModel, AIModelDiscovery } from "./types";

export interface ModelResearchRecord {
  jobId: string;
  runId: string;
  sourceId: string;
  findingId: string;
}

interface ResearchServiceLike {
  createJob(input: {
    projectId: string;
    title: string;
    query: string;
    priority?: "low" | "medium" | "high" | "critical";
    createdBy: string;
  }): { id: string };
  startRun(
    jobId: string
  ): { success: boolean; error?: string; run?: ResearchRun };
  addSource(
    runId: string,
    data: Omit<ResearchSource, "id" | "discoveredAt">
  ): { success: boolean; error?: string; source?: ResearchSource };
  addFinding(
    runId: string,
    data: Omit<ResearchFinding, "id" | "createdAt" | "runId">
  ): { success: boolean; error?: string; finding?: ResearchFinding };
  completeRun(runId: string): { success: boolean };
}

export function recordAIModelDiscovery(
  service: ResearchServiceLike,
  model: AIModel,
  discovery?: AIModelDiscovery
): { success: boolean; error?: string; record?: ModelResearchRecord } {
  const primary = model.sources[0];
  if (!primary) {
    return { success: false, error: "model has no source url to verify" };
  }

  const job = service.createJob({
    projectId: "ai-model-research",
    title: model.name,
    query: model.description ?? `Research AI model ${model.name}`,
    priority: "medium",
    createdBy: "ai-model-research",
  });

  const runResult = service.startRun(job.id);
  if (!runResult.success || !runResult.run) {
    return {
      success: false,
      error: runResult.error ?? "Failed to start research run",
    };
  }
  const runId = runResult.run.id;

  const sourceResult = service.addSource(runId, {
    url: primary.url,
    title: primary.title,
    sourceType: primary.kind === "github" ? "github" : "web",
    publisher: primary.title,
    accessedAt: new Date().toISOString(),
    reliability: "medium",
    status: "accessed",
  });
  if (!sourceResult.success || !sourceResult.source) {
    return {
      success: false,
      error: sourceResult.error ?? "Failed to record source",
    };
  }

  const findingResult = service.addFinding(runId, {
    sourceId: sourceResult.source.id,
    claim: `AI model "${model.name}" discovered (${model.category}) from ${primary.url}`,
    evidence: JSON.stringify({
      providerId: model.providerId,
      category: model.category,
      description: model.description,
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxOutputTokens,
      access: model.access,
      tags: model.tags,
      modalities: model.modalities,
      apiModelId: model.apiModelId,
      releasedAt: model.releasedAt,
      cost: model.cost,
      confidence: model.confidence,
      verified: model.verified,
      sources: model.sources,
      discovery: discovery
        ? {
            kind: discovery.kind,
            score: discovery.score,
            summary: discovery.summary,
          }
        : undefined,
      retrievedAt: new Date().toISOString(),
    }),
    confidence: model.confidence,
  });
  if (!findingResult.success || !findingResult.finding) {
    return {
      success: false,
      error: findingResult.error ?? "Failed to record finding",
    };
  }

  service.completeRun(runId);

  return {
    success: true,
    record: {
      jobId: job.id,
      runId,
      sourceId: sourceResult.source.id,
      findingId: findingResult.finding.id,
    },
  };
}