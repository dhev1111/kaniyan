import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ProviderHealth,
} from "./types";
import { GeminiProvider, GroqProvider, OpenAIProvider } from "./providers";
import { modelRegistry } from "./registry";

export class ProviderManager {
  private providers: Map<string, LLMProvider> = new Map();

  constructor() {
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new GroqProvider());
    this.registerProvider(new OpenAIProvider());
  }

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  getConfiguredProviders(): LLMProvider[] {
    return this.getAllProviders().filter((p) => p.isConfigured());
  }

  async healthCheckAll(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];
    for (const provider of this.getAllProviders()) {
      const health = await provider.healthCheck();
      modelRegistry.updateProviderHealth(health);
      results.push(health);
    }
    return results;
  }

  async healthCheck(providerId: string): Promise<ProviderHealth> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        providerId,
        status: "error",
        latencyMs: 0,
        lastChecked: new Date().toISOString(),
        error: `Provider ${providerId} not found`,
      };
    }
    const health = await provider.healthCheck();
    modelRegistry.updateProviderHealth(health);
    return health;
  }

  async completeWithFallback(
    request: ChatRequest,
    fallbackChain: Array<{ providerId: string; modelId: string }> = [],
    maxAttempts = 3
  ): Promise<ChatResponse> {
    const attempts = [
      { providerId: request.model.split("/")[0] ?? "", modelId: request.model },
      ...fallbackChain,
    ].slice(0, maxAttempts);

    let lastError: Error | null = null;

    for (const attempt of attempts) {
      const provider = this.providers.get(attempt.providerId);
      if (!provider || !provider.isConfigured()) continue;

      try {
        const response = await provider.complete({
          ...request,
          model: attempt.modelId,
        });

        modelRegistry.logUsage({
          providerId: attempt.providerId,
          modelId: attempt.modelId,
          timestamp: new Date().toISOString(),
          latencyMs: response.latencyMs,
          usage: response.usage,
          success: true,
        });

        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        modelRegistry.logUsage({
          providerId: attempt.providerId,
          modelId: attempt.modelId,
          timestamp: new Date().toISOString(),
          latencyMs: 0,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          success: false,
          error: lastError.message,
        });
      }
    }

    throw lastError ?? new Error("All providers failed");
  }
}

export const providerManager = new ProviderManager();
