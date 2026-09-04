import type {
  ResearchJob,
  ResearchRun,
  ResearchSource,
  ResearchFinding,
  ResearchCitation,
} from "./types";

export interface ResearchRepository {
  createJob(job: ResearchJob): void;
  getJob(id: string): ResearchJob | undefined;
  listJobs(): ResearchJob[];
  updateJob(id: string, data: Partial<ResearchJob>): ResearchJob | undefined;

  createRun(run: ResearchRun): void;
  getRun(id: string): ResearchRun | undefined;
  listRuns(jobId: string): ResearchRun[];

  addSource(source: ResearchSource): void;
  attachSourceToRun(sourceId: string, runId: string): void;
  getSource(id: string): ResearchSource | undefined;
  listSources(runId: string): ResearchSource[];

  addFinding(finding: ResearchFinding): void;
  getFinding(id: string): ResearchFinding | undefined;
  listFindings(runId: string): ResearchFinding[];

  addCitation(citation: ResearchCitation): void;
  listCitations(findingId: string): ResearchCitation[];
}

export class InMemoryResearchRepository implements ResearchRepository {
  private jobs = new Map<string, ResearchJob>();
  private runs = new Map<string, ResearchRun>();
  private sources = new Map<string, ResearchSource>();
  private findings = new Map<string, ResearchFinding>();
  private citations = new Map<string, ResearchCitation>();
  private sourceRuns = new Map<string, string>();

  createJob(job: ResearchJob): void {
    this.jobs.set(job.id, job);
  }

  getJob(id: string): ResearchJob | undefined {
    return this.jobs.get(id);
  }

  listJobs(): ResearchJob[] {
    return Array.from(this.jobs.values())
      .map((job, idx) => ({ job, idx }))
      .sort((a, b) => {
        const timeDiff =
          new Date(b.job.createdAt).getTime() -
          new Date(a.job.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.idx - a.idx;
      })
      .map((x) => x.job);
  }

  updateJob(
    id: string,
    data: Partial<ResearchJob>
  ): ResearchJob | undefined {
    const existing = this.jobs.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id: existing.id };
    this.jobs.set(id, updated);
    return updated;
  }

  createRun(run: ResearchRun): void {
    this.runs.set(run.id, run);
  }

  getRun(id: string): ResearchRun | undefined {
    return this.runs.get(id);
  }

  listRuns(jobId: string): ResearchRun[] {
    return Array.from(this.runs.values())
      .filter((r) => r.jobId === jobId)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
  }

  addSource(source: ResearchSource): void {
    this.sources.set(source.id, source);
  }

  attachSourceToRun(sourceId: string, runId: string): void {
    this.sourceRuns.set(sourceId, runId);
  }

  getSource(id: string): ResearchSource | undefined {
    return this.sources.get(id);
  }

  listSources(runId: string): ResearchSource[] {
    return Array.from(this.sourceRuns.entries())
      .filter(([, rid]) => rid === runId)
      .map(([sid]) => this.sources.get(sid))
      .filter((s): s is ResearchSource => s !== undefined)
      .sort(
        (a, b) =>
          new Date(b.discoveredAt).getTime() -
          new Date(a.discoveredAt).getTime()
      );
  }

  addFinding(finding: ResearchFinding): void {
    this.findings.set(finding.id, finding);
  }

  getFinding(id: string): ResearchFinding | undefined {
    return this.findings.get(id);
  }

  listFindings(runId: string): ResearchFinding[] {
    return Array.from(this.findings.values())
      .filter((f) => f.runId === runId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  addCitation(citation: ResearchCitation): void {
    this.citations.set(citation.id, citation);
  }

  listCitations(findingId: string): ResearchCitation[] {
    return Array.from(this.citations.values())
      .filter((c) => c.findingId === findingId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }
}
