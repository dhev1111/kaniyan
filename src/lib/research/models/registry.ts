import type {
  AIModel,
  AIModelCategory,
  AIModelDiscovery,
  AIProvider,
  DiscoveryKind,
} from "./types";
import { CATEGORY_BY_DISCOVERY_KIND } from "./types";
import { CURATED_PROVIDERS, listProviders } from "./providers";

const MAX_MODELS = 200;
const MAX_DISCOVERIES = 300;
const MAX_REGISTERED_PROVIDERS = 200;

export interface RegistrySearchOptions {
  query?: string;
  kind?: DiscoveryKind;
  category?: AIModelCategory;
  limit?: number;
}

export class ModelRegistry {
  private models = new Map<string, AIModel>();
  private discoveries = new Map<string, AIModelDiscovery>();
  private registeredProviders = new Map<string, AIProvider>();

  private evictOldest<V>(map: Map<string, V>, max: number): void {
    while (map.size >= max) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest as string);
    }
  }

  addModel(model: AIModel): void {
    this.evictOldest(this.models, MAX_MODELS);
    this.models.set(model.id, model);
  }

  getModel(id: string): AIModel | undefined {
    return this.models.get(id);
  }

  listModels(limit = 50): AIModel[] {
    return Array.from(this.models.values())
      .sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt))
      .slice(0, limit);
  }

  searchModels(options: RegistrySearchOptions = {}): AIModel[] {
    const query = (options.query ?? "").trim().toLowerCase();
    const category = options.category;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

    let list = Array.from(this.models.values());
    if (category) {
      list = list.filter((model) => model.category === category);
    }
    if (query) {
      list = list.filter((model) =>
        [
          model.name,
          model.providerId,
          model.apiModelId ?? "",
          model.description ?? "",
          ...model.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }

    return list
      .sort((a, b) => {
        if (query) {
          const aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1;
          const bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
        }
        return b.firstSeenAt.localeCompare(a.firstSeenAt);
      })
      .slice(0, limit);
  }

  addDiscovery(discovery: AIModelDiscovery): void {
    this.evictOldest(this.discoveries, MAX_DISCOVERIES);
    this.discoveries.set(discovery.id, discovery);
  }

  getDiscovery(id: string): AIModelDiscovery | undefined {
    return this.discoveries.get(id);
  }

  listDiscoveries(limit = 50): AIModelDiscovery[] {
    return Array.from(this.discoveries.values())
      .sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt))
      .slice(0, limit);
  }

  searchDiscoveries(options: RegistrySearchOptions = {}): AIModelDiscovery[] {
    const query = (options.query ?? "").trim().toLowerCase();
    const kind = options.kind;
    const category = options.category;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

    let list = Array.from(this.discoveries.values());
    if (kind) {
      list = list.filter((discovery) => discovery.kind === kind);
    }
    if (category) {
      list = list.filter(
        (discovery) => CATEGORY_BY_DISCOVERY_KIND[discovery.kind] === category
      );
    }
    if (query) {
      list = list.filter((discovery) =>
        [
          discovery.title,
          discovery.summary,
          discovery.providerId ?? "",
          discovery.repositoryFullName ?? "",
          ...discovery.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }

    return list
      .sort(
        (a, b) => b.score - a.score || a.title.localeCompare(b.title)
      )
      .slice(0, limit);
  }

  registerProvider(provider: AIProvider): void {
    this.evictOldest(
      this.registeredProviders,
      MAX_REGISTERED_PROVIDERS
    );
    this.registeredProviders.set(provider.id, provider);
  }

  getProvider(idOrName: string): AIProvider | undefined {
    const needle = idOrName.trim().toLowerCase();
    const curated = listProviders().find(
      (provider) =>
        provider.id.toLowerCase() === needle ||
        provider.name.toLowerCase() === needle
    );
    if (curated) return curated;
    return Array.from(this.registeredProviders.values()).find(
      (provider) =>
        provider.id.toLowerCase() === needle ||
        provider.name.toLowerCase() === needle
    );
  }

  allProviders(): AIProvider[] {
    const curatedIds = new Set(CURATED_PROVIDERS.map((provider) => provider.id));
    const registered = Array.from(this.registeredProviders.values()).filter(
      (provider) => !curatedIds.has(provider.id)
    );
    return [...CURATED_PROVIDERS, ...registered];
  }

  clear(): void {
    this.models.clear();
    this.discoveries.clear();
    this.registeredProviders.clear();
  }

  get modelCount(): number {
    return this.models.size;
  }

  get discoveryCount(): number {
    return this.discoveries.size;
  }
}

export const modelRegistry = new ModelRegistry();