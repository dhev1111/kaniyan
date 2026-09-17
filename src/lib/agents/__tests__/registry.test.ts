import { AgentRegistry } from "@/lib/agents/registry";
import type { AgentDefinition } from "@/lib/agents/types";

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  const base: AgentDefinition = {
    agentId: `agent-${Math.random().toString(36).slice(2, 9)}`,
    templateId: "research",
    version: "1.0.0",
    name: "Test Agent",
    description: "test",
    purpose: "testing",
    role: "research",
    specialization: {},
    capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }],
    allowedTools: [],
    allowedSkills: [],
    allowedMcpReferences: [],
    inputSchema: { fields: {}, allowUnknown: false },
    outputSchema: { fields: {}, allowUnknown: false },
    resourceLimits: {
      maxConcurrentTasks: 3,
      maxRetries: 3,
      timeoutMs: 30000,
      maxMemoryBytes: 100 * 1024 * 1024,
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
  return base;
}

describe("M8 – registry", () => {
  it("registers and retrieves agent", () => {
    const registry = new AgentRegistry();
    const agent = makeAgent({ agentId: "agent-1", version: "1.0.0" });
    const result = registry.register(agent);
    expect(result.ok).toBe(true);
    const fetched = registry.get("agent-1", "1.0.0");
    expect(fetched?.agentId).toBe("agent-1");
  });

  it("rejects duplicate version for same template", () => {
    const registry = new AgentRegistry();
    const a1 = makeAgent({ agentId: "agent-dup-1", templateId: "research", version: "1.0.0" });
    const a2 = makeAgent({ agentId: "agent-dup-2", templateId: "research", version: "1.0.0" });
    expect(registry.register(a1).ok).toBe(true);
    const dup = registry.register(a2);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.issues[0]).toContain("Duplicate version");
  });

  it("returns undefined for unknown agent", () => {
    const registry = new AgentRegistry();
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("lists by template", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "a1", templateId: "research", version: "1.0.0" }));
    registry.register(makeAgent({ agentId: "a2", templateId: "coding", version: "1.0.0" }));
    expect(registry.list("research")).toHaveLength(1);
    expect(registry.list()).toHaveLength(2);
  });

  it("resolves only active agents with capability match", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "active-1", status: "active", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    registry.register(makeAgent({ agentId: "suspended-1", status: "suspended", capabilities: [{ capabilityId: "research", capabilityVersion: 1, required: true }] }));
    const resolved = registry.resolve("goal", [{ capabilityId: "research", capabilityVersion: 1 }]);
    expect(resolved.map((a) => a.agentId)).toContain("active-1");
    expect(resolved.map((a) => a.agentId)).not.toContain("suspended-1");
  });

  it("activates registered agent", () => {
    const registry = new AgentRegistry();
    const agent = makeAgent({ agentId: "act-1", status: "registered", version: "1.0.0" });
    registry.register(agent);
    expect(registry.activate("act-1", "1.0.0")).toBe(true);
    expect(registry.get("act-1")?.status).toBe("active");
  });

  it("rejects activation of unknown", () => {
    const registry = new AgentRegistry();
    expect(registry.activate("unknown", "1.0.0")).toBe(false);
  });

  it("suspends active agent", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "susp-1", status: "active" }));
    expect(registry.suspend("susp-1")).toBe(true);
    expect(registry.get("susp-1")?.status).toBe("suspended");
  });

  it("deprecates and retires", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "dep-1", status: "active" }));
    expect(registry.deprecate("dep-1")).toBe(true);
    expect(registry.get("dep-1")?.status).toBe("deprecated");
    expect(registry.retire("dep-1")).toBe(true);
    expect(registry.get("dep-1")?.status).toBe("retired");
  });

  it("retirement preserves historical attribution", () => {
    const registry = new AgentRegistry();
    const agent = makeAgent({ agentId: "hist-1", version: "2.0.0" });
    registry.register(agent);
    registry.retire("hist-1");
    const fetched = registry.get("hist-1");
    expect(fetched?.agentId).toBe("hist-1");
    expect(fetched?.version).toBe("2.0.0");
  });

  it("tracks active count", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "c1", status: "active" }));
    registry.register(makeAgent({ agentId: "c2", status: "registered" }));
    expect(registry.getActiveCount()).toBe(1);
  });
});
