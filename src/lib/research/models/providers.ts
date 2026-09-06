import type { AIProvider } from "./types";

const CURATED_PROVIDER_SEEN_AT = "2024-01-01T00:00:00.000Z";

export const CURATED_PROVIDERS: AIProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    website: "https://openai.com",
    apiBaseUrl: "https://api.openai.com/v1",
    description: "Developer of GPT models and the ChatGPT service.",
    sources: [{ kind: "official", url: "https://openai.com", title: "OpenAI" }],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    website: "https://www.anthropic.com",
    apiBaseUrl: "https://api.anthropic.com",
    description: "Developer of the Claude model family.",
    sources: [
      {
        kind: "official",
        url: "https://www.anthropic.com",
        title: "Anthropic",
      },
    ],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "google-ai",
    name: "Google AI",
    website: "https://ai.google.dev",
    apiBaseUrl: "https://generativelanguage.googleapis.com",
    description:
      "Google's Gemini models and generative AI developer platform.",
    sources: [
      {
        kind: "docs",
        url: "https://ai.google.dev",
        title: "Google AI for Developers",
      },
    ],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    website: "https://mistral.ai",
    apiBaseUrl: "https://api.mistral.ai/v1",
    description: "European AI lab offering open-weight and hosted LLMs.",
    sources: [
      { kind: "official", url: "https://mistral.ai", title: "Mistral AI" },
    ],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "meta",
    name: "Meta",
    website: "https://ai.meta.com",
    description: "Publisher of the Llama open-weight model family.",
    sources: [
      { kind: "official", url: "https://ai.meta.com", title: "Meta AI" },
    ],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    website: "https://www.deepseek.com",
    apiBaseUrl: "https://api.deepseek.com",
    description: "Chinese AI lab publishing open-weight reasoning models.",
    sources: [
      { kind: "official", url: "https://www.deepseek.com", title: "DeepSeek" },
    ],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "xai",
    name: "xAI",
    website: "https://x.ai",
    apiBaseUrl: "https://api.x.ai/v1",
    description: "Developer of the Grok model family.",
    sources: [{ kind: "official", url: "https://x.ai", title: "xAI" }],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "cohere",
    name: "Cohere",
    website: "https://cohere.com",
    apiBaseUrl: "https://api.cohere.ai/v1",
    description: "Enterprise-focused LLM and RAG provider.",
    sources: [{ kind: "official", url: "https://cohere.com", title: "Cohere" }],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "groq",
    name: "Groq",
    website: "https://groq.com",
    apiBaseUrl: "https://api.groq.com/openai/v1",
    description: "Fast inference cloud for open models on LPU hardware.",
    sources: [{ kind: "official", url: "https://groq.com", title: "Groq" }],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "together",
    name: "Together AI",
    website: "https://www.together.ai",
    apiBaseUrl: "https://api.together.xyz/v1",
    description: "Cloud inference platform for open-source models.",
    sources: [
      {
        kind: "official",
        url: "https://www.together.ai",
        title: "Together AI",
      },
    ],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    website: "https://huggingface.co",
    description: "Open-source AI model hub, datasets, and tooling.",
    sources: [
      { kind: "official", url: "https://huggingface.co", title: "Hugging Face" },
    ],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
  {
    id: "alibaba-qwen",
    name: "Alibaba Qwen",
    website: "https://qwenlm.github.io",
    description: "Open-weight multilingual model family from Alibaba.",
    sources: [
      { kind: "official", url: "https://qwenlm.github.io", title: "Qwen" },
    ],
    firstSeenAt: CURATED_PROVIDER_SEEN_AT,
    verified: true,
  },
];

export function listProviders(query?: string): AIProvider[] {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return CURATED_PROVIDERS;
  return CURATED_PROVIDERS.filter((provider) =>
    [provider.id, provider.name, provider.description, provider.website]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

export function findProvider(idOrName: string): AIProvider | undefined {
  const needle = idOrName.trim().toLowerCase();
  return CURATED_PROVIDERS.find(
    (provider) =>
      provider.id.toLowerCase() === needle ||
      provider.name.toLowerCase() === needle
  );
}