import {
  InMemoryResearchRepository,
  ResearchService,
  ResearchPipeline,
} from "@/lib/research";
import { MockSourceAdapter } from "@/lib/research/adapters/mock-adapter";

function makeService() {
  const repo = new InMemoryResearchRepository();
  const service = new ResearchService(repo);
  return { repo, service };
}

function makeJobInput(overrides = {}) {
  return {
    projectId: "p1",
    title: "Test Research",
    query: "What is the state of autonomous agents?",
    createdBy: "test-user",
    ...overrides,
  };
}

describe("Research — Job Creation", () => {
  it("creates a job with queued status", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    expect(job.id).toBeDefined();
    expect(job.status).toBe("queued");
    expect(job.priority).toBe("medium");
    expect(job.createdAt).toBeDefined();
    expect(job.updatedAt).toBeDefined();
  });

  it("creates a job with custom priority", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput({ priority: "high" }));
    expect(job.priority).toBe("high");
  });
});

describe("Research — Job Retrieval", () => {
  it("retrieves a job by id", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    const found = service.getJob(job.id);
    expect(found).toEqual(job);
  });

  it("returns undefined for unknown job", () => {
    const { service } = makeService();
    expect(service.getJob("nonexistent")).toBeUndefined();
  });

  it("lists all jobs newest first", () => {
    const { service } = makeService();
    const a = service.createJob(makeJobInput({ title: "A" }));
    const b = service.createJob(makeJobInput({ title: "B" }));
    const jobs = service.listJobs();
    expect(jobs.length).toBe(2);
    expect(jobs[0].id).toBe(b.id);
    expect(jobs[1].id).toBe(a.id);
  });
});

describe("Research — Job Lifecycle", () => {
  it("moves through valid transitions", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    expect(service.transitionJob(job.id, "planning").success).toBe(true);
    expect(service.transitionJob(job.id, "collecting").success).toBe(true);
    expect(service.transitionJob(job.id, "analyzing").success).toBe(true);
    expect(service.transitionJob(job.id, "verifying").success).toBe(true);
    expect(service.transitionJob(job.id, "completed").success).toBe(true);
    expect(service.getJob(job.id)?.status).toBe("completed");
  });

  it("rejects invalid state transitions", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    const result = service.transitionJob(job.id, "completed");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid transition");
  });

  it("rejects transition from a terminal state", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    service.transitionJob(job.id, "cancelled");
    const result = service.transitionJob(job.id, "queued");
    expect(result.success).toBe(false);
  });
});

describe("Research — Run Creation", () => {
  it("creates a run for a queued job", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    const result = service.startRun(job.id);
    expect(result.success).toBe(true);
    expect(result.run).toBeDefined();
    expect(result.run?.jobId).toBe(job.id);
    expect(result.run?.status).toBe("collecting");
    expect(result.run?.sourceCount).toBe(0);
  });

  it("rejects creating a run for an unknown job", () => {
    const { service } = makeService();
    const result = service.startRun("nonexistent");
    expect(result.success).toBe(false);
  });

  it("rejects creating a run for a cancelled job", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    service.cancelJob(job.id);
    const result = service.startRun(job.id);
    expect(result.success).toBe(false);
  });
});

describe("Research — Source Creation", () => {
  it("adds a source and increments run source count", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    const run = service.startRun(job.id).run!;
    const result = service.addSource(run.id, {
      url: "https://example.com",
      title: "Example",
      sourceType: "web",
      publisher: "Example Corp",
      accessedAt: new Date().toISOString(),
      reliability: "unknown",
      status: "accessed",
    });
    expect(result.success).toBe(true);
    expect(result.source).toBeDefined();
    expect(service.listSources(run.id).length).toBe(1);
  });

  it("rejects source creation for unknown run", () => {
    const { service } = makeService();
    const result = service.addSource("nonexistent", {
      url: "https://example.com",
      title: "Example",
      sourceType: "web",
      publisher: "Example Corp",
      accessedAt: new Date().toISOString(),
      reliability: "unknown",
      status: "accessed",
    });
    expect(result.success).toBe(false);
  });
});

describe("Research — Finding Creation", () => {
  it("adds a finding and increments run finding count", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    const run = service.startRun(job.id).run!;
    const src = service.addSource(run.id, {
      url: "https://example.com",
      title: "Example",
      sourceType: "web",
      publisher: "Example Corp",
      accessedAt: new Date().toISOString(),
      reliability: "unknown",
      status: "accessed",
    }).source!;
    const result = service.addFinding(run.id, {
      sourceId: src.id,
      claim: "A claim",
      evidence: "Supporting evidence",
      confidence: 0.8,
    });
    expect(result.success).toBe(true);
    expect(result.finding).toBeDefined();
    expect(service.listFindings(run.id).length).toBe(1);
  });

  it("rejects finding creation for unknown run", () => {
    const { service } = makeService();
    const result = service.addFinding("nonexistent", {
      sourceId: "s1",
      claim: "claim",
      evidence: "evidence",
      confidence: 0.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("Research — Citation Creation", () => {
  it("adds a citation and lists it by finding", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    const run = service.startRun(job.id).run!;
    const src = service.addSource(run.id, {
      url: "https://example.com",
      title: "Example",
      sourceType: "web",
      publisher: "Example Corp",
      accessedAt: new Date().toISOString(),
      reliability: "unknown",
      status: "accessed",
    }).source!;
    const finding = service.addFinding(run.id, {
      sourceId: src.id,
      claim: "claim",
      evidence: "evidence",
      confidence: 0.8,
    }).finding!;
    const result = service.addCitation({
      findingId: finding.id,
      sourceId: src.id,
      location: "p.2",
      quote: "Direct quote",
    });
    expect(result.success).toBe(true);
    expect(service.listCitations(finding.id).length).toBe(1);
  });
});

describe("Research — Mock Adapter", () => {
  it("returns search results without network access", async () => {
    const adapter = new MockSourceAdapter("mock1", "Mock", "web");
    const results = await adapter.search("test query", 3);
    expect(results.length).toBe(3);
    expect(results[0].url).toContain("mock-source.example.com");
  });

  it("returns a fetched source with unknown reliability", async () => {
    const adapter = new MockSourceAdapter("mock1", "Mock", "web");
    const result = await adapter.fetch("https://example.com/article");
    expect(result.source.reliability).toBe("unknown");
    expect(result.source.status).toBe("accessed");
    expect(result.content).toContain("No real data");
  });
});

describe("Research — Pipeline Lifecycle", () => {
  it("runs the full pipeline to completion using mock adapter", async () => {
    const repo = new InMemoryResearchRepository();
    const service = new ResearchService(repo);
    const pipeline = new ResearchPipeline(service, repo);

    const job = service.createJob(makeJobInput());
    const result = await pipeline.execute(job);

    expect(result.error).toBeUndefined();
    expect(result.completedStages).toEqual([
      "query",
      "discovery",
      "collection",
      "extraction",
      "verification",
      "findings",
    ]);
    expect(result.sourceCount).toBeGreaterThan(0);
    expect(result.findingCount).toBeGreaterThan(0);
    expect(service.getJob(job.id)?.status).toBe("completed");
  });

  it("handles pipeline execution without adapters", async () => {
    const repo = new InMemoryResearchRepository();
    const service = new ResearchService(repo);
    const pipeline = new ResearchPipeline(service, repo, { adapters: [] });

    const job = service.createJob(makeJobInput());
    const result = await pipeline.execute(job);

    expect(result.error).toBeDefined();
    expect(service.getJob(job.id)?.status).toBe("failed");
  });
});

describe("Research — Cancellation", () => {
  it("cancels a queued job", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    const result = service.cancelJob(job.id);
    expect(result.success).toBe(true);
    expect(service.getJob(job.id)?.status).toBe("cancelled");
  });

  it("cannot cancel a completed job", () => {
    const { service } = makeService();
    const job = service.createJob(makeJobInput());
    service.transitionJob(job.id, "planning");
    service.transitionJob(job.id, "collecting");
    service.transitionJob(job.id, "analyzing");
    service.transitionJob(job.id, "verifying");
    service.transitionJob(job.id, "completed");
    const result = service.cancelJob(job.id);
    expect(result.success).toBe(false);
  });
});

describe("Research — Invalid Input", () => {
  it("rejects jobs without required fields", () => {
    const { service } = makeService();
    expect(() =>
      service.createJob({
        projectId: "",
        title: "",
        query: "",
        createdBy: "user",
      })
    ).toThrow("projectId, title, and query are required");
  });

  it("rejects jobs with missing title", () => {
    const { service } = makeService();
    expect(() =>
      service.createJob({
        projectId: "p1",
        title: "",
        query: "valid query",
        createdBy: "user",
      })
    ).toThrow();
  });

  it("rejects transitions on unknown jobs", () => {
    const { service } = makeService();
    const result = service.transitionJob("missing", "planning");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});
