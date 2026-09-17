import { AgentFactory } from "@/lib/agents/factory";
import { AgentRegistry } from "@/lib/agents/registry";

describe("M8 – factory", () => {
  it("creates agent from valid template", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const result = factory.createAgentDefinition("research", { domain: "ai", purpose: "research ai" }, "tester");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definition.templateId).toBe("research");
  });

  it("rejects unknown template", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const result = factory.createAgentDefinition("unknown-template", {}, "tester");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toContain("Unknown template");
  });

  it("rejects specialization with forbidden field", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const result = factory.createAgentDefinition("research", { resourceLimits: { maxConcurrentTasks: 100 } } as unknown as Record<string, unknown> as never, "tester");
    expect(result.ok).toBe(false);
  });

  it("rejects resource limits exceeding template defaults", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const result = factory.createAgentDefinition("research", { resourceLimits: { timeoutMs: 999999 } }, "tester");
    expect(result.ok).toBe(false);
  });

  it("registers valid agent", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const created = factory.createAgentDefinition("coding", { domain: "backend" }, "tester");
    expect(created.ok).toBe(true);
    if (created.ok) {
      const reg = factory.registerAgent(created.definition);
      expect(reg.ok).toBe(true);
    }
  });

  it("rejects duplicate registration", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const created = factory.createAgentDefinition("research", { domain: "test" }, "tester");
    expect(created.ok).toBe(true);
    if (created.ok) {
      const first = factory.registerAgent(created.definition);
      expect(first.ok).toBe(true);
      const second = factory.registerAgent(created.definition);
      expect(second.ok).toBe(false);
    }
  });

  it("enforces maxActiveAgents limit", () => {
    const registry = new AgentRegistry();
    const factory = new AgentFactory({ registry });
    for (let i = 0; i < 50; i++) {
      if (i > 0 && i % 10 === 0) factory.resetRunCounter();
      const c = factory.createAgentDefinition("research", { domain: `d${i}` }, "tester");
      if (c.ok) {
        const reg = factory.registerAgent({ ...c.definition, status: "active" as const, agentId: `limit-${i}`, version: `1.0.${i}` });
        void reg;
      }
    }
    factory.resetRunCounter();
    for (let i = 50; i < 55; i++) {
      const c = factory.createAgentDefinition("research", { domain: `d${i}` }, "tester");
      void c;
    }
    const extra = factory.createAgentDefinition("research", { domain: "extra" }, "tester");
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.issues[0].toLowerCase()).toMatch(/max active|creation per run|limit/);
  });

  it("enforces creation per run limit", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    for (let i = 0; i < 10; i++) {
      const c = factory.createAgentDefinition("research", { domain: `d${i}` }, "tester");
      if (c.ok) factory.registerAgent({ ...c.definition, agentId: `run-${i}`, version: `1.0.${i}` });
    }
    const extra = factory.createAgentDefinition("research", { domain: "overflow" }, "tester");
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.issues[0]).toContain("creation per run");
  });

  it("activates and suspends", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const created = factory.createAgentDefinition("research", { domain: "x" }, "tester");
    expect(created.ok).toBe(true);
    if (created.ok) {
      const def = { ...created.definition, status: "registered" as const };
      const reg = factory.registerAgent(def);
      expect(reg.ok).toBe(true);
      expect(factory.activateAgent(def.agentId, def.version)).toBe(true);
      expect(factory.suspendAgent(def.agentId)).toBe(true);
    }
  });

  it("validates agent output", () => {
    const factory = new AgentFactory({ registry: new AgentRegistry() });
    const schema = { fields: { name: { type: "string", required: true } }, allowUnknown: false };
    expect(factory.validateAgentOutput({ name: "ok" }, schema).valid).toBe(true);
    expect(factory.validateAgentOutput({}, schema).valid).toBe(false);
    expect(factory.validateAgentOutput({ name: "ok", extra: 1 }, schema).valid).toBe(false);
  });
});
