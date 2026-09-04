import type {
  ResearchJob,
  ResearchJobStatus,
  ResearchRun,
  ResearchSource,
  ResearchFinding,
  ResearchCitation,
  ResearchPriority,
} from "./types";
import type { ResearchRepository } from "./repository";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

const VALID_JOB_TRANSITIONS: Record<ResearchJobStatus, ResearchJobStatus[]> = {
  queued: ["planning", "cancelled"],
  planning: ["collecting", "cancelled"],
  collecting: ["analyzing", "failed", "cancelled"],
  analyzing: ["verifying", "failed", "cancelled"],
  verifying: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export class ResearchService {
  constructor(private repo: ResearchRepository) {}

  createJob(input: {
    projectId: string;
    title: string;
    query: string;
    priority?: ResearchPriority;
    createdBy: string;
  }): ResearchJob {
    if (!input.projectId || !input.title || !input.query) {
      throw new Error("projectId, title, and query are required");
    }

    const now = nowISO();
    const job: ResearchJob = {
      id: generateId(),
      projectId: input.projectId,
      title: input.title,
      query: input.query,
      status: "queued",
      priority: input.priority ?? "medium",
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
    };
    this.repo.createJob(job);
    return job;
  }

  getJob(id: string): ResearchJob | undefined {
    return this.repo.getJob(id);
  }

  listJobs(): ResearchJob[] {
    return this.repo.listJobs();
  }

  listRuns(jobId: string): ResearchRun[] {
    return this.repo.listRuns(jobId);
  }

  transitionJob(
    id: string,
    newStatus: ResearchJobStatus
  ): { success: boolean; error?: string; job?: ResearchJob } {
    const job = this.repo.getJob(id);
    if (!job) {
      return { success: false, error: `Job ${id} not found` };
    }

    const allowed = VALID_JOB_TRANSITIONS[job.status];
    if (!allowed.includes(newStatus)) {
      return {
        success: false,
        error: `Invalid transition: ${job.status} → ${newStatus}. Allowed: ${allowed.join(", ")}`,
      };
    }

    const updated = this.repo.updateJob(id, {
      status: newStatus,
      updatedAt: nowISO(),
    });
    return { success: true, job: updated };
  }

  cancelJob(id: string): { success: boolean; error?: string } {
    return this.transitionJob(id, "cancelled");
  }

  startRun(jobId: string): { success: boolean; error?: string; run?: ResearchRun } {
    const job = this.repo.getJob(jobId);
    if (!job) {
      return { success: false, error: `Job ${jobId} not found` };
    }

    if (job.status !== "queued" && job.status !== "planning") {
      return {
        success: false,
        error: `Cannot start run for job in status "${job.status}"`,
      };
    }

    if (job.status === "queued") {
      const toPlanning = this.transitionJob(jobId, "planning");
      if (!toPlanning.success) {
        return { success: false, error: toPlanning.error };
      }
    }

    const transition = this.transitionJob(jobId, "collecting");
    if (!transition.success) {
      return { success: false, error: transition.error };
    }

    const run: ResearchRun = {
      id: generateId(),
      jobId,
      startedAt: nowISO(),
      status: "collecting",
      sourceCount: 0,
      findingCount: 0,
    };
    this.repo.createRun(run);
    return { success: true, run };
  }

  completeRun(
    runId: string
  ): { success: boolean; error?: string; run?: ResearchRun } {
    const run = this.repo.getRun(runId);
    if (!run) {
      return { success: false, error: `Run ${runId} not found` };
    }

    const updated: ResearchRun = {
      ...run,
      status: "completed",
      completedAt: nowISO(),
    };
    this.repo.createRun(updated);

    const job = this.repo.getJob(run.jobId);
    if (job) {
      if (job.status === "collecting" || job.status === "analyzing" || job.status === "verifying") {
        this.forceCompleteJob(run.jobId);
      } else {
        this.transitionJob(run.jobId, "completed");
      }
    }

    return { success: true, run: updated };
  }

  private forceCompleteJob(jobId: string): void {
    const chain: ResearchJobStatus[] = ["analyzing", "verifying", "completed"];
    for (const target of chain) {
      const result = this.transitionJob(jobId, target);
      if (!result.success) {
        return;
      }
    }
  }

  failRun(
    runId: string,
    error: string
  ): { success: boolean; error?: string; run?: ResearchRun } {
    const run = this.repo.getRun(runId);
    if (!run) {
      return { success: false, error: `Run ${runId} not found` };
    }

    const updated: ResearchRun = {
      ...run,
      status: "failed",
      completedAt: nowISO(),
      error,
    };
    this.repo.createRun(updated);

    const job = this.repo.getJob(run.jobId);
    if (job) {
      this.transitionJob(run.jobId, "failed");
    }

    return { success: true, run: updated };
  }

  addSource(
    runId: string,
    data: Omit<ResearchSource, "id" | "discoveredAt">
  ): { success: boolean; error?: string; source?: ResearchSource } {
    const run = this.repo.getRun(runId);
    if (!run) {
      return { success: false, error: `Run ${runId} not found` };
    }

    const source: ResearchSource = {
      ...data,
      id: generateId(),
      discoveredAt: nowISO(),
    };
    this.repo.addSource(source);
    this.repo.attachSourceToRun(source.id, runId);

    const updatedRun: ResearchRun = {
      ...run,
      sourceCount: run.sourceCount + 1,
    };
    this.repo.createRun(updatedRun);

    return { success: true, source };
  }

  addFinding(
    runId: string,
    data: Omit<ResearchFinding, "id" | "createdAt" | "runId">
  ): { success: boolean; error?: string; finding?: ResearchFinding } {
    const run = this.repo.getRun(runId);
    if (!run) {
      return { success: false, error: `Run ${runId} not found` };
    }

    const finding: ResearchFinding = {
      ...data,
      runId,
      id: generateId(),
      createdAt: nowISO(),
    };
    this.repo.addFinding(finding);

    const updatedRun: ResearchRun = {
      ...run,
      findingCount: run.findingCount + 1,
    };
    this.repo.createRun(updatedRun);

    return { success: true, finding };
  }

  addCitation(
    data: Omit<ResearchCitation, "id" | "createdAt">
  ): { success: boolean; citation?: ResearchCitation } {
    const citation: ResearchCitation = {
      ...data,
      id: generateId(),
      createdAt: nowISO(),
    };
    this.repo.addCitation(citation);
    return { success: true, citation };
  }

  listSources(runId: string): ResearchSource[] {
    return this.repo.listSources(runId);
  }

  listFindings(runId: string): ResearchFinding[] {
    return this.repo.listFindings(runId);
  }

  listCitations(findingId: string): ResearchCitation[] {
    return this.repo.listCitations(findingId);
  }
}
