import type {
  ModelSelectionInput,
  RouteDecision,
  CostClassification,
  ModelCapability,
} from "./types";
import { modelRegistry } from "./registry";

export class LLMRouter {
  selectModel(input: ModelSelectionInput): RouteDecision | null {
    const enabled = modelRegistry.getEnabledModels();
    if (enabled.length === 0) {
      return null;
    }

    const configured = modelRegistry.getConfiguredProviders();
    const configuredIds = new Set(configured.map((p) => p.id));

    const scored = enabled
      .filter((m) => configuredIds.has(m.providerId))
      .map((m) => ({
        model: m,
        score: modelRegistry.scoreModel(m, input),
      }))
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return this.buildFallbackDecision();
    }

    const best = scored[0];
    const fallbackChain = scored.slice(1, 4).map((s) => ({
      providerId: s.model.providerId,
      modelId: s.model.id,
    }));

    return {
      providerId: best.model.providerId,
      modelId: best.model.id,
      reason: this.buildReason(best.model, input, best.score),
      fallbackChain,
    };
  }

  private buildFallbackDecision(): RouteDecision | null {
    const freeModels = modelRegistry.getFreeModels();
    if (freeModels.length === 0) return null;

    const best = freeModels[0];
    return {
      providerId: best.providerId,
      modelId: best.id,
      reason: "No configured providers. Selected best available free model.",
      fallbackChain: freeModels.slice(1, 3).map((m) => ({
        providerId: m.providerId,
        modelId: m.id,
      })),
    };
  }

  private buildReason(
    model: {
      displayName: string;
      providerId: string;
      capabilities: ModelCapability;
      costClassification: CostClassification;
      freeTierAvailable: boolean;
    },
    input: ModelSelectionInput,
    score: number
  ): string {
    const parts: string[] = [];
    parts.push(`Selected ${model.displayName} (${model.providerId})`);
    parts.push(
      `Capability "${input.requiredCapability}": ${model.capabilities[input.requiredCapability]}`
    );
    parts.push(`Cost: ${model.costClassification}`);
    if (model.freeTierAvailable) parts.push("Free tier available");
    parts.push(`Score: ${score}`);
    return parts.join(". ");
  }

  selectForTask(
    taskDescription: string,
    options?: {
      preferFree?: boolean;
      maxCost?: CostClassification;
      latencyPreference?: "fast" | "balanced" | "quality";
    }
  ): RouteDecision | null {
    const capability = this.inferCapability(taskDescription);
    return this.selectModel({
      taskDescription,
      requiredCapability: capability,
      preferFree: options?.preferFree ?? true,
      maxCost: options?.maxCost,
      latencyPreference: options?.latencyPreference ?? "balanced",
    });
  }

  private inferCapability(
    taskDescription: string
  ): keyof ModelCapability {
    const lower = taskDescription.toLowerCase();
    if (
      lower.includes("code") ||
      lower.includes("program") ||
      lower.includes("debug") ||
      lower.includes("implement")
    ) {
      return "coding";
    }
    if (
      lower.includes("research") ||
      lower.includes("analyze") ||
      lower.includes("investigate")
    ) {
      return "research";
    }
    if (
      lower.includes("reason") ||
      lower.includes("logic") ||
      lower.includes("plan")
    ) {
      return "reasoning";
    }
    if (
      lower.includes("write") ||
      lower.includes("create") ||
      lower.includes("design")
    ) {
      return "creative";
    }
    return "reasoning";
  }
}

export const llmRouter = new LLMRouter();
