import type {
  ModelEntry,
  ModelCapability,
  CostClassification,
  ProviderConfig,
  ProviderHealth,
  ProviderUsageLog,
} from "./types";

function nowISO(): string {
  return new Date().toISOString();
}

const defaultModels: ModelEntry[] = [
  {
    id: "gemini-2.5-flash",
    providerId: "gemini",
    displayName: "Gemini 2.5 Flash",
    contextWindow: 1048576,
    maxOutput: 8192,
    capabilities: {
      coding: "good",
      reasoning: "good",
      research: "excellent",
      creative: "good",
      speed: "excellent",
      reliability: "good",
    },
    costClassification: "free",
    freeTierAvailable: true,
    enabled: true,
    lastVerified: nowISO(),
  },
  {
    id: "gemini-2.5-pro",
    providerId: "gemini",
    displayName: "Gemini 2.5 Pro",
    contextWindow: 1048576,
    maxOutput: 65536,
    capabilities: {
      coding: "excellent",
      reasoning: "excellent",
      research: "excellent",
      creative: "excellent",
      speed: "good",
      reliability: "excellent",
    },
    costClassification: "low",
    freeTierAvailable: true,
    enabled: true,
    lastVerified: nowISO(),
  },
  {
    id: "llama-3.3-70b-versatile",
    providerId: "groq",
    displayName: "Llama 3.3 70B Versatile",
    contextWindow: 131072,
    maxOutput: 32768,
    capabilities: {
      coding: "good",
      reasoning: "good",
      research: "good",
      creative: "good",
      speed: "excellent",
      reliability: "good",
    },
    costClassification: "free",
    freeTierAvailable: true,
    enabled: true,
    lastVerified: nowISO(),
  },
  {
    id: "llama-3.1-8b-instant",
    providerId: "groq",
    displayName: "Llama 3.1 8B Instant",
    contextWindow: 131072,
    maxOutput: 8192,
    capabilities: {
      coding: "basic",
      reasoning: "basic",
      research: "basic",
      creative: "basic",
      speed: "excellent",
      reliability: "good",
    },
    costClassification: "free",
    freeTierAvailable: true,
    enabled: true,
    lastVerified: nowISO(),
  },
  {
    id: "gpt-4o-mini",
    providerId: "openai",
    displayName: "GPT-4o Mini",
    contextWindow: 128000,
    maxOutput: 16384,
    capabilities: {
      coding: "good",
      reasoning: "good",
      research: "good",
      creative: "good",
      speed: "excellent",
      reliability: "excellent",
    },
    costClassification: "low",
    freeTierAvailable: false,
    enabled: true,
    lastVerified: nowISO(),
  },
  {
    id: "gpt-4o",
    providerId: "openai",
    displayName: "GPT-4o",
    contextWindow: 128000,
    maxOutput: 16384,
    capabilities: {
      coding: "excellent",
      reasoning: "excellent",
      research: "excellent",
      creative: "excellent",
      speed: "good",
      reliability: "excellent",
    },
    costClassification: "high",
    freeTierAvailable: false,
    enabled: true,
    lastVerified: nowISO(),
  },
];

const defaultProviders: ProviderConfig[] = [
  {
    id: "gemini",
    displayName: "Google Gemini",
    apiKeyEnvVar: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    status: "unconfigured",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
  },
  {
    id: "groq",
    displayName: "Groq",
    apiKeyEnvVar: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    status: "unconfigured",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  },
  {
    id: "openai",
    displayName: "OpenAI",
    apiKeyEnvVar: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    status: "unconfigured",
    models: ["gpt-4o-mini", "gpt-4o"],
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    status: "unconfigured",
    models: [],
  },
];

const CAPABILITY_RANK: Record<string, number> = {
  none: 0,
  basic: 1,
  good: 2,
  excellent: 3,
};

export class ModelRegistry {
  private models: Map<string, ModelEntry> = new Map();
  private providers: Map<string, ProviderConfig> = new Map();
  private healthCache: Map<string, ProviderHealth> = new Map();
  private usageLogs: ProviderUsageLog[] = [];

  constructor() {
    for (const model of defaultModels) {
      this.models.set(model.id, model);
    }
    for (const provider of defaultProviders) {
      this.providers.set(provider.id, provider);
    }
    this.checkEnvironmentKeys();
  }

  private checkEnvironmentKeys(): void {
    for (const [, provider] of this.providers) {
      const key = process.env[provider.apiKeyEnvVar];
      if (key && key.length > 0) {
        provider.status = "configured";
      }
    }
  }

  getModel(id: string): ModelEntry | undefined {
    return this.models.get(id);
  }

  getAllModels(): ModelEntry[] {
    return Array.from(this.models.values());
  }

  getEnabledModels(): ModelEntry[] {
    return this.getAllModels().filter((m) => m.enabled);
  }

  getModelsByProvider(providerId: string): ModelEntry[] {
    return this.getAllModels().filter((m) => m.providerId === providerId);
  }

  getFreeModels(): ModelEntry[] {
    return this.getEnabledModels().filter((m) => m.freeTierAvailable);
  }

  addModel(model: Omit<ModelEntry, "lastVerified">): ModelEntry {
    const entry: ModelEntry = {
      ...model,
      lastVerified: nowISO(),
    };
    this.models.set(entry.id, entry);
    return entry;
  }

  updateModel(
    id: string,
    data: Partial<ModelEntry>
  ): ModelEntry | undefined {
    const existing = this.models.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id: existing.id };
    this.models.set(id, updated);
    return updated;
  }

  disableModel(id: string): boolean {
    return this.updateModel(id, { enabled: false }) !== undefined;
  }

  enableModel(id: string): boolean {
    return this.updateModel(id, { enabled: true }) !== undefined;
  }

  getProvider(id: string): ProviderConfig | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  getConfiguredProviders(): ProviderConfig[] {
    return this.getAllProviders().filter((p) => p.status === "configured");
  }

  updateProviderHealth(health: ProviderHealth): void {
    this.healthCache.set(health.providerId, health);
    const provider = this.providers.get(health.providerId);
    if (provider) {
      provider.status = health.status;
      provider.lastHealthCheck = health.lastChecked;
      provider.latencyMs = health.latencyMs;
    }
  }

  getProviderHealth(providerId: string): ProviderHealth | undefined {
    return this.healthCache.get(providerId);
  }

  scoreModel(
    model: ModelEntry,
    input: {
      requiredCapability: keyof ModelCapability;
      preferFree?: boolean;
      maxCost?: CostClassification;
      contextTokens?: number;
    }
  ): number {
    let score = 0;
    const cap = model.capabilities[input.requiredCapability];
    score += (CAPABILITY_RANK[cap] ?? 0) * 30;

    if (input.preferFree && model.freeTierAvailable) score += 25;
    if (input.maxCost) {
      const costRank: Record<CostClassification, number> = {
        free: 4,
        low: 3,
        medium: 2,
        high: 1,
      };
      if (costRank[model.costClassification] <= costRank[input.maxCost]) {
        score += 15;
      }
    }

    if (
      input.contextTokens &&
      model.contextWindow >= input.contextTokens
    ) {
      score += 10;
    }

    const speedRank = CAPABILITY_RANK[model.capabilities.speed] ?? 0;
    score += speedRank * 5;

    const reliabilityRank =
      CAPABILITY_RANK[model.capabilities.reliability] ?? 0;
    score += reliabilityRank * 5;

    const provider = this.providers.get(model.providerId);
    if (provider?.status === "configured") score += 10;

    return score;
  }

  logUsage(log: ProviderUsageLog): void {
    this.usageLogs.push(log);
    if (this.usageLogs.length > 1000) {
      this.usageLogs = this.usageLogs.slice(-500);
    }
  }

  getUsageLogs(limit?: number): ProviderUsageLog[] {
    const sorted = [...this.usageLogs].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getAverageLatency(providerId: string): number {
    const logs = this.usageLogs.filter(
      (l) => l.providerId === providerId && l.success
    );
    if (logs.length === 0) return 0;
    return logs.reduce((sum, l) => sum + l.latencyMs, 0) / logs.length;
  }

  getSuccessRate(providerId: string): number {
    const logs = this.usageLogs.filter(
      (l) => l.providerId === providerId
    );
    if (logs.length === 0) return 1;
    return logs.filter((l) => l.success).length / logs.length;
  }
}

export const modelRegistry = new ModelRegistry();
