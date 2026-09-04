export type CostClassification = "free" | "low" | "medium" | "high";

export type CapabilityRating = "none" | "basic" | "good" | "excellent";

export type ProviderStatus = "configured" | "unconfigured" | "error" | "healthy" | "degraded";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  usage: UsageMetrics;
  latencyMs: number;
  finishReason: "stop" | "length" | "error";
}

export interface UsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelCapability {
  coding: CapabilityRating;
  reasoning: CapabilityRating;
  research: CapabilityRating;
  creative: CapabilityRating;
  speed: CapabilityRating;
  reliability: CapabilityRating;
}

export interface ModelEntry {
  id: string;
  providerId: string;
  displayName: string;
  contextWindow: number;
  maxOutput: number;
  capabilities: ModelCapability;
  costClassification: CostClassification;
  freeTierAvailable: boolean;
  enabled: boolean;
  lastVerified: string;
}

export interface ProviderConfig {
  id: string;
  displayName: string;
  apiKeyEnvVar: string;
  baseUrl: string;
  status: ProviderStatus;
  models: string[];
  lastHealthCheck?: string;
  latencyMs?: number;
}

export interface ProviderHealth {
  providerId: string;
  status: ProviderStatus;
  latencyMs: number;
  lastChecked: string;
  error?: string;
}

export interface RouteDecision {
  providerId: string;
  modelId: string;
  reason: string;
  fallbackChain: Array<{ providerId: string; modelId: string }>;
}

export interface LLMProvider {
  readonly id: string;
  readonly displayName: string;
  isConfigured(): boolean;
  healthCheck(): Promise<ProviderHealth>;
  complete(request: ChatRequest): Promise<ChatResponse>;
}

export interface ModelSelectionInput {
  taskDescription: string;
  requiredCapability: keyof ModelCapability;
  preferredModel?: string;
  maxCost?: CostClassification;
  preferFree?: boolean;
  contextTokens?: number;
  latencyPreference?: "fast" | "balanced" | "quality";
}

export interface ProviderUsageLog {
  providerId: string;
  modelId: string;
  timestamp: string;
  latencyMs: number;
  usage: UsageMetrics;
  success: boolean;
  error?: string;
}
