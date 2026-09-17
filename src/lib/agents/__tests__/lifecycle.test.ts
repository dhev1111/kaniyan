import { AgentRegistry } from "@/lib/agents/registry";
import { suspendAgent, resumeAgent, deprecateAgent, retireAgent, canAgentReceiveWork, isAgentRetired } from "@/lib/agents/lifecycle";
import { validateAgentTransition, canTransitionAgent } from "@/lib/agents/state";
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

describe("M8 – lifecycle", () => {
  it("allows draft → validating", () => {
    expect(canTransitionAgent("draft", "validating")).toBe(true);
    expect(validateAgentTransition("draft", "validating").valid).toBe(true);
  });

  it("rejects draft → active", () => {
    expect(canTransitionAgent("draft", "active")).toBe(false);
    expect(validateAgentTransition("draft", "active").valid).toBe(false);
  });

  it("rejects retired → active", () => {
    expect(canTransitionAgent("retired", "active")).toBe(false);
  });

  it("validates registered → active", () => {
    expect(canTransitionAgent("registered", "active")).toBe(true);
  });

  it("suspends active agent and blocks new work", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "lc-1", status: "active" }));
    const res = suspendAgent(registry, "lc-1", "test");
    expect(res.ok).toBe(true);
    expect(registry.get("lc-1")?.status).toBe("suspended");
    expect(canAgentReceiveWork("suspended")).toBe(false);
    expect(canAgentReceiveWork("active")).toBe(true);
  });

  it("resumes suspended agent", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "lc-2", status: "active" }));
    suspendAgent(registry, "lc-2", "test");
    const res = resumeAgent(registry, "lc-2");
    expect(res.ok).toBe(true);
    expect(registry.get("lc-2")?.status).toBe("active");
  });

  it("rejects suspend from draft", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "lc-3", status: "draft" as never }));
    const res = suspendAgent(registry, "lc-3", "test");
    expect(res.ok).toBe(false);
  });

  it("deprecates active agent", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "lc-4", status: "active" }));
    const res = deprecateAgent(registry, "lc-4");
    expect(res.ok).toBe(true);
    expect(registry.get("lc-4")?.status).toBe("deprecated");
  });

  it("retires deprecated agent", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "lc-5", status: "active" }));
    deprecateAgent(registry, "lc-5");
    const res = retireAgent(registry, "lc-5");
    expect(res.ok).toBe(true);
    expect(isAgentRetired("retired")).toBe(true);
    expect(canAgentReceiveWork("retired")).toBe(false);
  });

  it("rejects retire directly from active", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "lc-6", status: "active" }));
    const res = retireAgent(registry, "lc-6");
    expect(res.ok).toBe(false);
  });

  it("retired agent never receives new tasks", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "lc-7", status: "active" }));
    deprecateAgent(registry, "lc-7");
    retireAgent(registry, "lc-7");
    expect(registry.get("lc-7")?.status).toBe("retired");
    expect(canAgentReceiveWork(registry.get("lc-7")!.status)).toBe(false);
  });
});
