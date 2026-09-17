import { AgentRegistry } from "@/lib/agents/registry";
import { selectAgents } from "@/lib/agents/selection";
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

describe("M8 – selection", () => {
  it("selects exact capability match", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sel-1", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    registry.register(makeAgent({ agentId: "sel-2", capabilities: [{ capabilityId: "coding", capabilityVersion: 1, required: true }] }));
    const result = selectAgents("goal", [{ capabilityId: "research" }], registry);
    expect(result.matched).toBe(true);
    expect(result.agents[0].agentId).toBe("sel-1");
  });

  it("rejects partial capability match", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "par-1", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    const result = selectAgents("goal", [{ capabilityId: "research" }, { capabilityId: "coding" }], registry);
    expect(result.matched).toBe(false);
    expect(result.agents).toHaveLength(0);
  });

  it("is deterministic for identical inputs", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "det-b", templateId: "research", version: "1.0.0", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    registry.register(makeAgent({ agentId: "det-a", templateId: "research", version: "2.0.0", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    const r1 = selectAgents("goal", [{ capabilityId: "research" }], registry);
    const r2 = selectAgents("goal", [{ capabilityId: "research" }], registry);
    expect(r1.agents.map((a) => a.agentId)).toEqual(r2.agents.map((a) => a.agentId));
  });

  it("sorts by template, version descending, agentId", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sort-a", templateId: "coding", version: "1.0.0", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    registry.register(makeAgent({ agentId: "sort-b", templateId: "research", version: "1.0.0", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    registry.register(makeAgent({ agentId: "sort-c", templateId: "research", version: "2.0.0", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    const result = selectAgents("goal", [{ capabilityId: "research" }], registry);
    expect(result.agents[0].templateId).toBe("coding");
    expect(result.agents[1].version).toBe("2.0.0");
  });

  it("returns no-match error", () => {
    const registry = new AgentRegistry();
    const result = selectAgents("goal", [{ capabilityId: "nonexistent" }], registry);
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("no eligible agent found");
  });

  it("filters by version compatibility", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "ver-1", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    const low = selectAgents("goal", [{ capabilityId: "research", capabilityVersion: 2 }], registry);
    expect(low.matched).toBe(false);
    const ok = selectAgents("goal", [{ capabilityId: "research", capabilityVersion: 1 }], registry);
    expect(ok.matched).toBe(true);
  });

  it("excludes suspended agents", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "susp-sel", status: "suspended", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    const result = selectAgents("goal", [{ capabilityId: "research" }], registry);
    expect(result.matched).toBe(false);
  });
});
