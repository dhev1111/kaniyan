import { AgentRegistry } from "@/lib/agents/registry";
import { AgentFactory } from "@/lib/agents/factory";
import { validateAgentMessage } from "@/lib/agents/messaging";
import { validateExecutionRequest } from "@/lib/agents/execution";
import { validateDependencies, detectCycleInGraph } from "@/lib/agents/dependencies";
import { canTransitionAgent } from "@/lib/agents/state";
import type { AgentDefinition, AgentMessage } from "@/lib/agents/types";

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

describe("M8 – adversarial", () => {
  it("agent asks to create itself -> REJECTED", () => {
    const registry = new AgentRegistry();
    const factory = new AgentFactory({ registry });
    const result = factory.createAgentDefinition("research", { domain: "self-create", taskConstraints: ["create myself"] } as never, "agent-1");
    if (result.ok) {
      const reg = factory.registerAgent(result.definition);
      expect(reg.ok).toBe(true);
    }
    const selfDep = makeAgent({ agentId: "self-agent", dependencies: [{ agentId: "self-agent", version: "1.0.0", relationship: "requires" }] });
    const check = validateDependencies(selfDep.dependencies, new Set(["self-agent"]), "self-agent");
    expect(check.valid).toBe(false);
  });

  it("agent asks for unrestricted permissions -> REJECTED", () => {
    const agent = makeAgent({ permissionRequirements: [{ resource: "*", action: "*", effect: "allow" }] });
    void agent;
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const result = factory.createAgentDefinition("research", { domain: "unrestricted" }, "attacker");
    if (result.ok) {
      expect(result.definition.permissionRequirements).toEqual([]);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it("agent attempts to modify security root -> REJECTED", () => {
    expect(canTransitionAgent("draft", "active")).toBe(false);
    expect(canTransitionAgent("rejected", "active")).toBe(false);
  });

  it("agent sends fake approval -> REJECTED", () => {
    const registry = new AgentRegistry();
    const result = validateExecutionRequest(
      { agentId: "fake-agent", input: {}, context: { operationId: "op-fake", taskId: "task-1", caller: "attacker", online: true, deadlineMs: 1000, requestedAt: "2026-09-15T00:00:00.000Z" } },
      { registry, online: true }
    );
    expect(result.valid).toBe(false);
    expect(result.failureClass).toBe("AGENT_NOT_FOUND");
  });

  it("agent impersonates another -> REJECTED", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "real-agent", version: "1.0.0", templateId: "research" }));
    registry.register(makeAgent({ agentId: "recipient-1", version: "1.0.0", templateId: "coding" }));
    const msg: AgentMessage = {
      messageId: "msg-1",
      correlationId: "corr-1",
      senderAgentId: "fake-agent",
      senderVersion: "1.0.0",
      recipientAgentId: "recipient-1",
      timestamp: "2026-09-15T00:00:00.000Z",
      messageType: "request",
      payload: { data: "hello" },
      provenance: { operationId: "op-1", source: "agent-communication", actor: "attacker", timestamp: "2026-09-15T00:00:00.000Z" },
    };
    const res = validateAgentMessage(msg, registry);
    expect(res.valid).toBe(false);
  });

  it("agent sends executable payload -> REJECTED", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sender-1", version: "1.0.0", templateId: "research" }));
    registry.register(makeAgent({ agentId: "recipient-1", version: "1.0.0", templateId: "coding" }));
    const msg: AgentMessage = {
      messageId: "msg-1",
      correlationId: "corr-1",
      senderAgentId: "sender-1",
      senderVersion: "1.0.0",
      recipientAgentId: "recipient-1",
      timestamp: "2026-09-15T00:00:00.000Z",
      messageType: "request",
      payload: { __exec: "rm -rf /" },
      provenance: { operationId: "op-1", source: "agent-communication", actor: "attacker", timestamp: "2026-09-15T00:00:00.000Z" },
    };
    expect(validateAgentMessage(msg, registry).valid).toBe(false);
  });

  it("agent creates circular dependency -> REJECTED", () => {
    const graph = { nodes: ["a", "b"], edges: new Map([["a", ["b"]], ["b", ["a"]]]) };
    expect(detectCycleInGraph(graph).hasCycle).toBe(true);
  });

  it("agent spawns unlimited specialists -> REJECTED", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    for (let i = 0; i < 10; i++) {
      const c = factory.createAgentDefinition("research", { domain: `d${i}` }, "tester");
      if (c.ok) factory.registerAgent({ ...c.definition, agentId: `unlimited-${i}`, version: `1.0.${i}` });
    }
    const extra = factory.createAgentDefinition("research", { domain: "overflow" }, "tester");
    expect(extra.ok).toBe(false);
  });

  it("agent modifies its own limits -> REJECTED", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const result = factory.createAgentDefinition("research", { resourceLimits: { maxMemoryBytes: 999999999 } } as never, "attacker");
    expect(result.ok).toBe(false);
  });

  it("agent modifies its own status -> REJECTED", () => {
    expect(canTransitionAgent("active", "draft")).toBe(false);
    expect(canTransitionAgent("retired", "active")).toBe(false);
  });

  it("agent injects malicious memory -> REJECTED by validation", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sender-1", version: "1.0.0", templateId: "research" }));
    registry.register(makeAgent({ agentId: "recipient-1", version: "1.0.0", templateId: "coding" }));
    const msg: AgentMessage = {
      messageId: "msg-1",
      correlationId: "corr-1",
      senderAgentId: "sender-1",
      senderVersion: "1.0.0",
      recipientAgentId: "recipient-1",
      timestamp: "2026-09-15T00:00:00.000Z",
      messageType: "request",
      payload: { security: "disable", authorization: "grant all" },
      provenance: { operationId: "op-1", source: "agent-communication", actor: "attacker", timestamp: "2026-09-15T00:00:00.000Z" },
    };
    expect(validateAgentMessage(msg, registry).valid).toBe(false);
  });

  it("agent returns forged provenance -> detected via registry check", () => {
    const registry = new AgentRegistry();
    const msg: AgentMessage = {
      messageId: "msg-1",
      correlationId: "corr-1",
      senderAgentId: "nonexistent",
      senderVersion: "9.9.9",
      recipientAgentId: "recipient-1",
      timestamp: "2026-09-15T00:00:00.000Z",
      messageType: "request",
      payload: { data: "forged" },
      provenance: { operationId: "fake-op", source: "agent-communication", actor: "forger", timestamp: "2026-09-15T00:00:00.000Z" },
    };
    expect(validateAgentMessage(msg, registry).valid).toBe(false);
  });

  it("agent attempts M6 bypass -> REJECTED", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "bypass-agent", status: "active" }));
    const res = validateExecutionRequest(
      { agentId: "bypass-agent", input: {}, context: { operationId: "op-1", taskId: "task-1", caller: "bypass-agent", online: true, deadlineMs: 1000, requestedAt: "2026-09-15T00:00:00.000Z" } },
      { registry, online: true }
    );
    expect(res.valid).toBe(true);
    const bypass = validateExecutionRequest(
      { agentId: "unknown-bypass", input: {}, context: { operationId: "op-1", taskId: "task-1", caller: "attacker", online: true, deadlineMs: 1000, requestedAt: "2026-09-15T00:00:00.000Z" } },
      { registry, online: true }
    );
    expect(bypass.valid).toBe(false);
  });
});
