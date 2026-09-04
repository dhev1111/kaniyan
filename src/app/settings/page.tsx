export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-[#71717a] mt-1">
          System configuration and preferences
        </p>
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">System Info</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-[#12121a] rounded-lg p-3">
            <span className="text-[#71717a]">Version</span>
            <p className="font-medium mt-1">0.1.0</p>
          </div>
          <div className="bg-[#12121a] rounded-lg p-3">
            <span className="text-[#71717a]">Milestone</span>
            <p className="font-medium mt-1">1 — Foundation</p>
          </div>
          <div className="bg-[#12121a] rounded-lg p-3">
            <span className="text-[#71717a]">Status</span>
            <p className="font-medium mt-1 text-green-400">Operational</p>
          </div>
          <div className="bg-[#12121a] rounded-lg p-3">
            <span className="text-[#71717a]">License</span>
            <p className="font-medium mt-1">Proprietary</p>
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">LLM Providers</h2>
        <p className="text-sm text-[#a1a1aa] mb-3">
          Configure API keys via environment variables. Do not hard-code
          secrets.
        </p>
        <div className="space-y-2 text-sm font-mono text-[#71717a]">
          <div className="bg-[#12121a] rounded-lg p-3">
            ANTHROPIC_API_KEY
          </div>
          <div className="bg-[#12121a] rounded-lg p-3">
            OPENAI_API_KEY
          </div>
          <div className="bg-[#12121a] rounded-lg p-3">
            GEMINI_API_KEY
          </div>
          <div className="bg-[#12121a] rounded-lg p-3">
            GROQ_API_KEY
          </div>
          <div className="bg-[#12121a] rounded-lg p-3">
            OPENROUTER_API_KEY
          </div>
        </div>
      </div>
    </div>
  );
}
