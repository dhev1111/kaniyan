import { AgentRegistry } from "@/lib/agents/registry";
import { validateDependencies, buildDependencyGraph, detectCycleInGraph, computeDependencyDepth, resolveDependencyOrder, getTransitiveDependencies } from "@/lib/agents/dependencies";
import type { AgentDefinition } from "@/lib/agents/types";

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    agentId: `agent-${Math.random().toString(36).slice(2, 9)}`,
    templateId: "research",
    version: "1.0.0",
    name: "Test",
    description: "test",
    purpose: "testing",
    role: "research",
    specialization: {},
    capabilities: [],
    allowedTools: [],
    allowedSkills: [],
    allowedMcpReferences: [],
    inputSchema: { fields: {}, allowUnknown: false },
    outputSchema: { fields: {}, allowUnknown: false },
    resourceLimits: {
      maxConcurrentTasks: 3,
      maxRetries: 3,
      timeoutMs: 30000,
      maxMemoryBytes: 104857600,
      maxContextTokens: 4096,
      maxToolCalls: 100,
      maxMcpCalls: 50,
      maxExecutionTimeMs: 300000,
    },
    retryPolicy: { maxRetries: 3, delayMs: 1000, backoffMultiplier: 2 },
    securityClassification: "internal",
    permissionRequirements: [],
    dependencies: [],
    provenance: {
      operationId: "op-1",
      source: "agent-factory",
      actor: "test",
      timestamp: "2026-09-15T00:00:00.000Z",
      templateId: "research",
      templateVersion: "1.0.0",
      specializationHash: "",
    },
    status: "active",
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("M8 – dependencies", () => {
  it("validates correct dependencies", () => {
    const allIds = new Set(["agent-1", "agent-2"]);
    const deps = [{ agentId: "agent-1", version: "1.0.0", relationship: "requires" as const }];
    const result = validateDependencies(deps, allIds);
    expect(result.valid).toBe(true);
  });

  it("rejects missing dependency", () => {
    const allIds = new Set(["agent-1"]);
    const deps = [{ agentId: "missing", version: "1.0.0", relationship: "requires" as const }];
    const result = validateDependencies(deps, allIds);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing dependency"))).toBe(true);
  });

  it("rejects self-dependency", () => {
    const allIds = new Set(["agent-1", "agent-2"]);
    const deps = [{ agentId: "agent-1", version: "1.0.0", relationship: "requires" as const }];
    const result = validateDependencies(deps, allIds, "agent-1");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("self-dependency"))).toBe(true);
  });

  it("detects cycle", () => {
    const graph = {
      nodes: ["a", "b"],
      edges: new Map([["a", ["b"]], ["b", ["a"]]]),
    };
    const cycle = detectCycleInGraph(graph);
    expect(cycle.hasCycle).toBe(true);
  });

  it("does not flag acyclic graph", () => {
    const graph = {
      nodes: ["a", "b", "c"],
      edges: new Map([["a", ["b"]], ["b", ["c"]], ["c", []]]),
    };
    const cycle = detectCycleInGraph(graph);
    expect(cycle.hasCycle).toBe(false);
  });

  it("computes dependency depth", () => {
    const graph = {
      nodes: ["a", "b", "c"],
      edges: new Map([["a", ["b"]], ["b", ["c"]], ["c", []]]),
    };
    expect(computeDependencyDepth("a", graph)).toBe(2);
    expect(computeDependencyDepth("c", graph)).toBe(0);
  });

  it("rejects exceeding depth limit", () => {
    const agents: AgentDefinition[] = Array.from({ length: 7 }, (_, i) =>
      makeAgent({ agentId: `depth-${i}` })
    );
    const allIds = new Set(agents.map((a) => a.agentId));
    const deps = agents.slice(1).map((a) => ({ agentId: a.agentId, version: "1.0.0", relationship: "requires" as const }));
    const result = validateDependencies(deps.slice(0, 6), allIds, "depth-0");
    expect(result.errors.some((e) => e.includes("dependency count") || e.includes("depth"))).toBeDefined();
  });

  it("resolves dependency order deterministically", () => {
    const a = makeAgent({ agentId: "order-a", dependencies: [] });
    const b = makeAgent({ agentId: "order-b", dependencies: [{ agentId: "order-a", version: "1.0.0", relationship: "requires" }] });
    const c = makeAgent({ agentId: "order-c", dependencies: [{ agentId: "order-b", version: "1.0.0", relationship: "requires" }] });
    const result = resolveDependencyOrder([a, b, c]);
    expect(result.hasCycle).toBe(false);
    expect(result.order).toContain("order-a");
    expect(result.order.indexOf("order-a")).toBeLessThan(result.order.indexOf("order-b"));
  });

  it("detects cycle in resolve order", () => {
    const a = makeAgent({ agentId: "cycle-a", dependencies: [{ agentId: "cycle-b", version: "1.0.0", relationship: "requires" }] });
    const b = makeAgent({ agentId: "cycle-b", dependencies: [{ agentId: "cycle-a", version: "1.0.0", relationship: "requires" }] });
    const result = resolveDependencyOrder([a, b]);
    expect(result.hasCycle).toBe(true);
  });

  it("gets transitive dependencies", () => {
    const graph = {
      nodes: ["a", "b", "c"],
      edges: new Map([["a", ["b"]], ["b", ["c"]], ["c", []]]),
    };
    const trans = getTransitiveDependencies("a", graph);
    expect(trans.has("b")).toBe(true);
    expect(trans.has("c")).toBe(true);
  });
});
