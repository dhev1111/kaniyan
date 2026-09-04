import { modelRegistry, providerManager } from "@/lib/llm";

function CapabilityBadge({ rating }: { rating: string }) {
  const colors: Record<string, string> = {
    none: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    basic: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    good: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    excellent: "bg-green-500/10 text-green-400 border-green-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
        colors[rating] ?? colors.none
      }`}
    >
      {rating}
    </span>
  );
}

function CostBadge({ cost }: { cost: string }) {
  const colors: Record<string, string> = {
    free: "bg-green-500/10 text-green-400 border-green-500/20",
    low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    high: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        colors[cost] ?? colors.free
      }`}
    >
      {cost}
    </span>
  );
}

function StatusIndicator({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        enabled ? "bg-green-400" : "bg-gray-500"
      }`}
    />
  );
}

export default function ModelsPage() {
  const models = modelRegistry.getAllModels();
  const llmProviders = providerManager.getAllProviders();
  const registryProviders = modelRegistry.getAllProviders();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Models</h1>
        <p className="text-sm text-[#71717a] mt-1">
          Model registry, capabilities, and provider configuration
        </p>
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Providers</h2>
        <p className="text-sm text-[#71717a] mb-4">
          Configure API keys via environment variables. Never hard-code
          secrets.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {llmProviders.map((lp) => {
            const config = modelRegistry.getProvider(lp.id);
            return (
              <div
                key={lp.id}
                className="bg-[#12121a] rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <StatusIndicator enabled={lp.isConfigured()} />
                    <span className="font-medium text-sm">
                      {lp.displayName}
                    </span>
                  </div>
                  <span
                    className={`text-xs ${
                      lp.isConfigured()
                        ? "text-green-400"
                        : "text-[#71717a]"
                    }`}
                  >
                    {lp.isConfigured() ? "Configured" : "Not configured"}
                  </span>
                </div>
                <div className="text-xs text-[#71717a] space-y-1">
                  <div className="flex justify-between">
                    <span>Env Variable</span>
                    <span className="font-mono">
                      {config?.apiKeyEnvVar ?? "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base URL</span>
                    <span className="font-mono truncate max-w-[200px]">
                      {config?.baseUrl ?? "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Models</span>
                    <span>{config?.models.length ?? 0}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl">
        <div className="p-4 border-b border-[#27272a]">
          <h2 className="text-sm font-semibold">Model Registry</h2>
        </div>
        {models.length === 0 ? (
          <div className="p-12 text-center text-[#71717a]">
            No models registered.
          </div>
        ) : (
          <div className="divide-y divide-[#27272a]">
            {models.map((model) => (
              <div
                key={model.id}
                className="p-4 hover:bg-[#22223a] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <StatusIndicator enabled={model.enabled} />
                    <div>
                      <span className="font-medium text-sm">
                        {model.displayName}
                      </span>
                      <span className="text-xs text-[#71717a] ml-2 font-mono">
                        {model.id}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CostBadge cost={model.costClassification} />
                    {model.freeTierAvailable && (
                      <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">
                        Free tier
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs text-[#71717a]">
                  <span>{model.providerId}</span>
                  <span>
                    Context: {(model.contextWindow / 1000).toFixed(0)}K
                  </span>
                  <span>
                    Max output: {(model.maxOutput / 1000).toFixed(0)}K
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <CapabilityBadge
                    rating={model.capabilities.coding}
                  />
                  <CapabilityBadge
                    rating={model.capabilities.reasoning}
                  />
                  <CapabilityBadge
                    rating={model.capabilities.research}
                  />
                  <CapabilityBadge
                    rating={model.capabilities.speed}
                  />
                  <CapabilityBadge
                    rating={model.capabilities.reliability}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
