import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ProviderHealth,
  UsageMetrics,
} from "./types";

function nowISO(): string {
  return new Date().toISOString();
}

export class GeminiProvider implements LLMProvider {
  readonly id = "gemini";
  readonly displayName = "Google Gemini";

  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured()) {
      return {
        providerId: this.id,
        status: "unconfigured",
        latencyMs: 0,
        lastChecked: nowISO(),
      };
    }

    const start = Date.now();
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      const latencyMs = Date.now() - start;

      if (response.ok) {
        return {
          providerId: this.id,
          status: "healthy",
          latencyMs,
          lastChecked: nowISO(),
        };
      }
      return {
        providerId: this.id,
        status: "error",
        latencyMs,
        lastChecked: nowISO(),
        error: `HTTP ${response.status}`,
      };
    } catch (err) {
      return {
        providerId: this.id,
        status: "error",
        latencyMs: Date.now() - start,
        lastChecked: nowISO(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async complete(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isConfigured()) {
      throw new Error("Gemini API key not configured");
    }

    const start = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${this.apiKey}`;

    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemMessage = request.messages.find(
      (m) => m.role === "system"
    );

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      },
    };

    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Gemini API error ${response.status}: ${errorBody}`
      );
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const usage = data.usageMetadata ?? {};

    const usageMetrics: UsageMetrics = {
      promptTokens: usage.promptTokenCount ?? 0,
      completionTokens: usage.candidatesTokenCount ?? 0,
      totalTokens: usage.totalTokenCount ?? 0,
    };

    return {
      content: text,
      model: request.model,
      provider: this.id,
      usage: usageMetrics,
      latencyMs,
      finishReason: "stop",
    };
  }
}

export class GroqProvider implements LLMProvider {
  readonly id = "groq";
  readonly displayName = "Groq";

  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured()) {
      return {
        providerId: this.id,
        status: "unconfigured",
        latencyMs: 0,
        lastChecked: nowISO(),
      };
    }

    const start = Date.now();
    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/models",
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }
      );
      const latencyMs = Date.now() - start;

      if (response.ok) {
        return {
          providerId: this.id,
          status: "healthy",
          latencyMs,
          lastChecked: nowISO(),
        };
      }
      return {
        providerId: this.id,
        status: "error",
        latencyMs,
        lastChecked: nowISO(),
        error: `HTTP ${response.status}`,
      };
    } catch (err) {
      return {
        providerId: this.id,
        status: "error",
        latencyMs: Date.now() - start,
        lastChecked: nowISO(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async complete(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isConfigured()) {
      throw new Error("Groq API key not configured");
    }

    const start = Date.now();

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.7,
        }),
      }
    );

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Groq API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage ?? {};

    return {
      content: text,
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      },
      latencyMs,
      finishReason: "stop",
    };
  }
}

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";

  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured()) {
      return {
        providerId: this.id,
        status: "unconfigured",
        latencyMs: 0,
        lastChecked: nowISO(),
      };
    }

    const start = Date.now();
    try {
      const response = await fetch(
        "https://api.openai.com/v1/models",
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }
      );
      const latencyMs = Date.now() - start;

      if (response.ok) {
        return {
          providerId: this.id,
          status: "healthy",
          latencyMs,
          lastChecked: nowISO(),
        };
      }
      return {
        providerId: this.id,
        status: "error",
        latencyMs,
        lastChecked: nowISO(),
        error: `HTTP ${response.status}`,
      };
    } catch (err) {
      return {
        providerId: this.id,
        status: "error",
        latencyMs: Date.now() - start,
        lastChecked: nowISO(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async complete(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isConfigured()) {
      throw new Error("OpenAI API key not configured");
    }

    const start = Date.now();

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.7,
        }),
      }
    );

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI API error ${response.status}: ${errorBody}`
      );
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage ?? {};

    return {
      content: text,
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      },
      latencyMs,
      finishReason: "stop",
    };
  }
}
