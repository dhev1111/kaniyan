import {
  modelRegistry,
  llmRouter,
  providerManager,
} from "@/lib/llm";

class MockProvider {
  readonly id: string;
  readonly displayName: string;
  private configured: boolean;
  private responseContent: string;

  constructor(
    id: string,
    displayName: string,
    configured = true,
    responseContent = "Mock response"
  ) {
    this.id = id;
    this.displayName = displayName;
    this.configured = configured;
    this.responseContent = responseContent;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async healthCheck() {
    return {
      providerId: this.id,
      status: this.configured ? ("healthy" as const) : ("unconfigured" as const),
      latencyMs: 50,
      lastChecked: new Date().toISOString(),
    };
  }

  async complete(request: { model: string }) {
    return {
      content: `${this.responseContent} for model ${request.model}`,
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      latencyMs: 100,
      finishReason: "stop" as const,
    };
  }

  setConfigured(val: boolean): void {
    this.configured = val;
  }
}

describe("ModelRegistry", () => {
  it("should have default models", () => {
    const models = modelRegistry.getAllModels();
    expect(models.length).toBeGreaterThan(0);
  });

  it("should have default providers", () => {
    const providers = modelRegistry.getAllProviders();
    expect(providers.length).toBeGreaterThan(0);
  });

  it("should get model by id", () => {
    const model = modelRegistry.getModel("gemini-2.5-flash");
    expect(model).toBeDefined();
    expect(model?.providerId).toBe("gemini");
  });

  it("should filter enabled models", () => {
    const enabled = modelRegistry.getEnabledModels();
    expect(enabled.length).toBeGreaterThan(0);
    enabled.forEach((m) => expect(m.enabled).toBe(true));
  });

  it("should filter free models", () => {
    const free = modelRegistry.getFreeModels();
    expect(free.length).toBeGreaterThan(0);
    free.forEach((m) => expect(m.freeTierAvailable).toBe(true));
  });

  it("should add a new model", () => {
    const model = modelRegistry.addModel({
      id: "test-model",
      providerId: "test",
      displayName: "Test Model",
      contextWindow: 1000,
      maxOutput: 500,
      capabilities: {
        coding: "basic",
        reasoning: "basic",
        research: "basic",
        creative: "basic",
        speed: "basic",
        reliability: "basic",
      },
      costClassification: "free",
      freeTierAvailable: true,
      enabled: true,
    });
    expect(model.id).toBe("test-model");
    expect(modelRegistry.getModel("test-model")).toBeDefined();
  });

  it("should disable and enable models", () => {
    modelRegistry.disableModel("test-model");
    expect(modelRegistry.getModel("test-model")?.enabled).toBe(false);
    modelRegistry.enableModel("test-model");
    expect(modelRegistry.getModel("test-model")?.enabled).toBe(true);
  });

  it("should score models correctly", () => {
    const model = modelRegistry.getModel("gemini-2.5-flash");
    expect(model).toBeDefined();
    if (model) {
      const score = modelRegistry.scoreModel(model, {
        requiredCapability: "research",
        preferFree: true,
      });
      expect(score).toBeGreaterThan(0);
    }
  });

  it("should track usage logs", () => {
    const initialCount = modelRegistry.getUsageLogs().length;
    modelRegistry.logUsage({
      providerId: "test",
      modelId: "test-model",
      timestamp: new Date().toISOString(),
      latencyMs: 100,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      success: true,
    });
    expect(modelRegistry.getUsageLogs().length).toBe(initialCount + 1);
  });
});

describe("LLMRouter", () => {
  it("should return a fallback result when no providers configured", () => {
    const result = llmRouter.selectModel({
      taskDescription: "Write code",
      requiredCapability: "coding",
    });
    expect(result).not.toBeNull();
    expect(result?.reason).toContain("free model");
  });

  it("should infer coding capability", () => {
    const result = llmRouter.selectForTask(
      "Write a Python function to sort data"
    );
    expect(result).not.toBeNull();
  });

  it("should infer research capability", () => {
    const result = llmRouter.selectForTask(
      "Research the latest AI frameworks"
    );
    expect(result).not.toBeNull();
  });
});

describe("ProviderManager", () => {
  it("should have registered providers", () => {
    const providers = providerManager.getAllProviders();
    expect(providers.length).toBeGreaterThan(0);
  });

  it("should get provider by id", () => {
    const gemini = providerManager.getProvider("gemini");
    expect(gemini).toBeDefined();
    expect(gemini?.displayName).toBe("Google Gemini");
  });

  it("should return unconfigured health for missing API key", async () => {
    const health = await providerManager.healthCheck("gemini");
    expect(health.status).toBe("unconfigured");
  });

  it("should register custom provider", () => {
    const mock = new MockProvider("custom", "Custom Provider");
    providerManager.registerProvider(mock as never);
    expect(providerManager.getProvider("custom")).toBe(mock);
  });
});

describe("LLMAgentExecutor", () => {
  it("should fail gracefully without configured providers", async () => {
    const { LLMAgentExecutor } = await import(
      "@/lib/llm/executor"
    );
    const executor = new LLMAgentExecutor();
    const result = await executor.execute({
      taskDefinition: {
        id: "t1",
        projectId: "p1",
        title: "Test Task",
        description: "Write code",
        priority: "medium",
        state: "running",
        retryCount: 0,
        maxRetries: 3,
        dependencies: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentDefinition: {
        id: "a1",
        name: "Test Agent",
        description: "A test agent",
        role: "coder",
        systemInstructions: "You are a coder.",
        skills: [],
        allowedTools: [],
        permissions: [],
        version: 1,
        maxConcurrentTasks: 1,
        maxRetries: 3,
        retryDelayMs: 1000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      session: {
        id: "s1",
        agentInstanceId: "a1",
        startedAt: new Date().toISOString(),
        taskIds: ["t1"],
        metadata: {},
      },
      run: {
        id: "r1",
        taskDefinitionId: "t1",
        agentInstanceId: "a1",
        sessionId: "s1",
        state: "running",
        attemptNumber: 1,
        startedAt: new Date().toISOString(),
      },
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
