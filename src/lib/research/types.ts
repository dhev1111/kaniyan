export type ResearchJobStatus =
  | "queued"
  | "planning"
  | "collecting"
  | "analyzing"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type ResearchPriority = "low" | "medium" | "high" | "critical";

export type ResearchSourceType = "web" | "github" | "document" | "api" | "other";

export type SourceReliability = "unknown" | "low" | "medium" | "high";

export type SourceStatus = "discovered" | "accessed" | "processed" | "failed";

export interface ResearchJob {
  id: string;
  projectId: string;
  title: string;
  query: string;
  status: ResearchJobStatus;
  priority: ResearchPriority;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ResearchRun {
  id: string;
  jobId: string;
  startedAt: string;
  completedAt?: string;
  status: ResearchJobStatus;
  sourceCount: number;
  findingCount: number;
  error?: string;
}

export interface ResearchSource {
  id: string;
  url: string;
  title: string;
  sourceType: ResearchSourceType;
  publisher: string;
  discoveredAt: string;
  accessedAt?: string;
  reliability: SourceReliability;
  status: SourceStatus;
}

export interface ResearchFinding {
  id: string;
  runId: string;
  sourceId: string;
  claim: string;
  evidence: string;
  confidence: number;
  createdAt: string;
}

export interface ResearchCitation {
  id: string;
  findingId: string;
  sourceId: string;
  location: string;
  quote: string;
  createdAt: string;
}

export interface ResearchQuery {
  text: string;
  sourceTypes?: ResearchSourceType[];
  maxSources?: number;
  priority?: ResearchPriority;
}
