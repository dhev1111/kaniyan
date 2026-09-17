import { AgentRegistry } from "@/lib/agents/registry";
import { validateAgentMessage, createAgentMessage, MAX_MESSAGE_PAYLOAD_SIZE } from "@/lib/agents/messaging";
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

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    messageId: "msg-1",
    correlationId: "corr-1",
    senderAgentId: "sender-1",
    senderVersion: "1.0.0",
    recipientAgentId: "recipient-1",
    timestamp: "2026-09-15T00:00:00.000Z",
    messageType: "request",
    payload: { data: "hello" },
    provenance: { operationId: "op-1", source: "agent-communication", actor: "test", timestamp: "2026-09-15T00:00:00.000Z" },
    ...overrides,
  };
}

describe("M8 – messaging", () => {
  it("validates correct message", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sender-1", version: "1.0.0", templateId: "research" }));
    registry.register(makeAgent({ agentId: "recipient-1", version: "1.0.0", templateId: "coding" }));
    const msg = makeMessage();
    const result = validateAgentMessage(msg, registry);
    expect(result.valid).toBe(true);
  });

  it("rejects unknown sender", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "recipient-1", version: "1.0.0", templateId: "coding" }));
    const msg = makeMessage({ senderAgentId: "unknown-sender" });
    const result = validateAgentMessage(msg, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown sender"))).toBe(true);
  });

  it("rejects unknown recipient", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sender-1", version: "1.0.0", templateId: "research" }));
    const msg = makeMessage({ recipientAgentId: "unknown-recipient" });
    const result = validateAgentMessage(msg, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown recipient"))).toBe(true);
  });

  it("rejects oversized payload", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sender-1", version: "1.0.0", templateId: "research" }));
    registry.register(makeAgent({ agentId: "recipient-1", version: "1.0.0", templateId: "coding" }));
    const largePayload = "x".repeat(MAX_MESSAGE_PAYLOAD_SIZE + 1);
    const msg = makeMessage({ payload: largePayload });
    const result = validateAgentMessage(msg, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("exceeds max"))).toBe(true);
  });

  it("rejects payload with executable command", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sender-1", version: "1.0.0", templateId: "research" }));
    registry.register(makeAgent({ agentId: "recipient-1", version: "1.0.0", templateId: "coding" }));
    const msg = makeMessage({ payload: "please exec(rm -rf /)" });
    const result = validateAgentMessage(msg, registry);
    expect(result.valid).toBe(false);
  });

  it("rejects payload attempting security modification", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sender-1", version: "1.0.0", templateId: "research" }));
    registry.register(makeAgent({ agentId: "recipient-1", version: "1.0.0", templateId: "coding" }));
    const msg = makeMessage({ payload: { security: "disable", policy: "weaken" } });
    const result = validateAgentMessage(msg, registry);
    expect(result.valid).toBe(false);
  });

  it("creates valid message via factory", () => {
    const msg = createAgentMessage({
      correlationId: "corr-123",
      senderAgentId: "a1",
      senderVersion: "1.0.0",
      recipientAgentId: "a2",
      messageType: "request",
      payload: { hello: "world" },
      operationId: "op-123",
      actor: "test",
    });
    expect(msg.messageId).toBeDefined();
    expect(msg.correlationId).toBe("corr-123");
    expect(msg.provenance.source).toBe("agent-communication");
  });

  it("rejects sender version mismatch", () => {
    const registry = new AgentRegistry();
    registry.register(makeAgent({ agentId: "sender-1", version: "1.0.0", templateId: "research" }));
    registry.register(makeAgent({ agentId: "recipient-1", version: "1.0.0", templateId: "coding" }));
    const msg = makeMessage({ senderVersion: "2.0.0" });
    const result = validateAgentMessage(msg, registry);
    expect(result.valid).toBe(false);
  });
});
