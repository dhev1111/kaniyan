import type { ResearchJob, ResearchSourceType } from "./types";
import type { ResearchSourceAdapter } from "./adapters/types";
import { MockSourceAdapter } from "./adapters/mock-adapter";
import type { ResearchRepository } from "./repository";
import type { ResearchService } from "./service";

export type PipelineStage =
  | "query"
  | "discovery"
  | "collection"
  | "extraction"
  | "verification"
  | "findings";

export interface PipelineResult {
  jobId: string;
  stages: PipelineStage[];
  completedStages: PipelineStage[];
  sourceCount: number;
  findingCount: number;
  error?: string;
}

export interface ResearchPipelineConfig {
  adapters: ResearchSourceAdapter[];
  maxSources: number;
  sourceTypes: ResearchSourceType[];
}

const DEFAULT_CONFIG: ResearchPipelineConfig = {
  adapters: [new MockSourceAdapter("mock-web", "Mock Web", "web")],
  maxSources: 5,
  sourceTypes: ["web"],
};

export class ResearchPipeline {
  private config: ResearchPipelineConfig;

  constructor(
    private service: ResearchService,
    private repo: ResearchRepository,
    config?: Partial<ResearchPipelineConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute(job: ResearchJob): Promise<PipelineResult> {
    const allStages: PipelineStage[] = [
      "query",
      "discovery",
      "collection",
      "extraction",
      "verification",
      "findings",
    ];
    const completedStages: PipelineStage[] = [];
    let sourceCount = 0;
    let findingCount = 0;

    const runResult = this.service.startRun(job.id);
    if (!runResult.success || !runResult.run) {
      return {
        jobId: job.id,
        stages: allStages,
        completedStages,
        sourceCount: 0,
        findingCount: 0,
        error: runResult.error,
      };
    }

    const runId = runResult.run.id;

    try {
      completedStages.push("query");

      const adapter = this.config.adapters[0];
      if (!adapter) {
        throw new Error("No source adapter configured");
      }

      const searchResults = await adapter.search(
        job.query,
        this.config.maxSources
      );
      completedStages.push("discovery");

      for (const result of searchResults.slice(0, this.config.maxSources)) {
        const fetchResult = await adapter.fetch(result.url);
        const addResult = this.service.addSource(runId, {
          url: fetchResult.source.url,
          title: fetchResult.source.title,
          sourceType: fetchResult.source.sourceType,
          publisher: fetchResult.source.publisher,
          accessedAt: fetchResult.source.accessedAt,
          reliability: "unknown",
          status: "accessed",
        });
        if (addResult.success && addResult.source) {
          sourceCount++;

          const findingResult = this.service.addFinding(runId, {
            sourceId: addResult.source.id,
            claim: `[Mock] Extracted from: ${result.title}`,
            evidence: fetchResult.content.slice(0, 200),
            confidence: 0.5,
          });
          if (findingResult.success) {
            findingCount++;
          }
        }
      }
      completedStages.push("collection");
      completedStages.push("extraction");

      this.service.completeRun(runId);
      completedStages.push("verification");
      completedStages.push("findings");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.service.failRun(runId, errorMsg);
      return {
        jobId: job.id,
        stages: allStages,
        completedStages,
        sourceCount,
        findingCount,
        error: errorMsg,
      };
    }

    return {
      jobId: job.id,
      stages: allStages,
      completedStages,
      sourceCount,
      findingCount,
    };
  }
}
