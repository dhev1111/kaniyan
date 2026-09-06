"use client";

import { useEffect, useState } from "react";
import type { ResearchJob } from "@/lib/research/types";
import type { GitHubRepository, GitHubSearchResult } from "@/lib/research/github";
import { CATEGORY_BY_DISCOVERY_KIND } from "@/lib/research/models/types";
import type {
  AIModelDiscovery,
  AIProvider,
} from "@/lib/research/models/types";

const DISCOVERY_KIND_LABELS: Record<string, string> = {
  model: "Model",
  provider: "Provider",
  "coding-model": "Coding model",
  "open-source-project": "Open-source project",
  "developer-tool": "Developer tool",
  infrastructure: "Infrastructure",
};

const MODEL_CATEGORY_LABELS: Record<string, string> = {
  foundation: "Foundation model",
  coding: "Coding model",
  reasoning: "Reasoning",
  agent: "Agentic",
  embedding: "Embedding",
  vision: "Vision",
  speech: "Speech",
  audio: "Audio",
  image: "Image",
  video: "Video",
  infrastructure: "Infrastructure",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  planning: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  collecting: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  analyzing: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  verifying: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        STATUS_COLORS[status] ?? STATUS_COLORS.queued
      }`}
    >
      {status}
    </span>
  );
}

function GitHubResearchSection({
  onRecorded,
}: {
  onRecorded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GitHubRepository[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  async function searchRepos(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/research/github/search?q=${encodeURIComponent(query)}`
      );
      if (res.ok) {
        const data: GitHubSearchResult = await res.json();
        setResults(data.items);
        setTotalCount(data.totalCount);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ?? "Search failed");
        setResults([]);
      }
    } catch {
      setMessage("Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function recordRepo(repo: GitHubRepository) {
    setMessage("");
    try {
      const res = await fetch("/api/research/github/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(repo),
      });
      if (res.ok) {
        setMessage(`Recorded ${repo.fullName} as a research source.`);
        onRecorded();
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ?? "Failed to record repository");
      }
    } catch {
      setMessage("Failed to record repository");
    }
  }

  return (
    <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
      <h2 className="text-lg font-semibold mb-1">GitHub Research</h2>
      <p className="text-sm text-[#71717a] mb-4">
        Search public GitHub repositories and record them as research
        sources. Metadata only; no code execution.
      </p>

      <form
        onSubmit={searchRepos}
        className="flex gap-2 mb-4"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          required
          maxLength={128}
          placeholder="Search GitHub repositories..."
          className="flex-1 bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching}
          className="bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {message && <p className="text-sm text-[#818cf8] mb-3">{message}</p>}
      {totalCount > 0 && (
        <p className="text-xs text-[#71717a] mb-3">
          {totalCount} results. Showing {results.length}.
        </p>
      )}

      {results.length > 0 && (
        <div className="divide-y divide-[#27272a]">
          {results.map((repo) => (
            <div
              key={repo.id}
              className="py-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">
                    {repo.fullName}
                  </span>
                  {repo.language && (
                    <span className="text-[10px] text-[#818cf8] bg-[#6366f1]/10 px-1.5 py-0.5 rounded border border-[#6366f1]/20">
                      {repo.language}
                    </span>
                  )}
                  {repo.archived && (
                    <span className="text-[10px] text-gray-400 bg-gray-500/10 px-1.5 py-0.5 rounded border border-gray-500/20">
                      archived
                    </span>
                  )}
                </div>
                {repo.description && (
                  <p className="text-sm text-[#71717a] line-clamp-2 mt-1">
                    {repo.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-1 text-xs text-[#71717a]">
                  <span>★ {repo.stars}</span>
                  <span>⑂ {repo.forks}</span>
                  <span>⚑ {repo.openIssues}</span>
                  <span>{repo.license ?? "no license"}</span>
                  <span>
                    Updated{" "}
                    {new Date(repo.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => recordRepo(repo)}
                className="shrink-0 bg-[#22c55e]/10 hover:bg-[#22c55e]/20 text-green-400 border border-[#22c55e]/20 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              >
                Research
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelResearchSection({
  onRecorded,
}: {
  onRecorded: () => void;
}) {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [discoveries, setDiscoveries] = useState<AIModelDiscovery[]>([]);
  const [searchResults, setSearchResults] = useState<AIModelDiscovery[]>([]);
  const [running, setRunning] = useState(false);
  const [includeGitHub, setIncludeGitHub] = useState(false);
  const [message, setMessage] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchKind, setSearchKind] = useState("");

  const [name, setName] = useState("");
  const [providerId, setProviderId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [category, setCategory] = useState("foundation");
  const [access, setAccess] = useState("api");
  const [description, setDescription] = useState("");

  async function loadProviders() {
    try {
      const res = await fetch("/api/research/models/providers");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.items);
      }
    } catch {
      setProviders([]);
    }
  }

  useEffect(() => {
    loadProviders();
  }, []);

  async function runDiscovery(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setMessage("");
    try {
      const res = await fetch("/api/research/models/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableGitHub: includeGitHub, limit: 15 }),
      });
      if (res.ok) {
        const data = await res.json();
        setDiscoveries(data.discoveries ?? []);
        setMessage(
          data.githubError
            ? `Discovered ${data.count} items. GitHub scan skipped: ${data.githubError}`
            : `Discovered ${data.count} items.`
        );
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ?? "Discovery failed");
      }
    } catch {
      setMessage("Discovery failed");
    } finally {
      setRunning(false);
    }
  }

  async function searchDiscoveries(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (searchKind) params.set("kind", searchKind);
      params.set("limit", "20");
      const res = await fetch(
        `/api/research/models/search?${params.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items ?? []);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ?? "Search failed");
        setSearchResults([]);
      }
    } catch {
      setMessage("Search failed");
      setSearchResults([]);
    }
  }

  async function recordModel(
    payload: Record<string, unknown>
  ): Promise<boolean> {
    setMessage("");
    try {
      const res = await fetch("/api/research/models/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onRecorded();
        return true;
      }
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Failed to record model");
      return false;
    } catch {
      setMessage("Failed to record model");
      return false;
    }
  }

  async function recordFromForm(e: React.FormEvent) {
    e.preventDefault();
    const ok = await recordModel({
      name,
      providerId,
      sourceUrl,
      category,
      access,
      description: description || undefined,
    });
    if (ok) {
      setMessage(`Recorded ${name} as a research source.`);
      setName("");
      setProviderId("");
      setSourceUrl("");
      setDescription("");
    }
  }

  async function recordDiscovery(discovery: AIModelDiscovery) {
    const ok = await recordModel({
      name: discovery.title,
      providerId: discovery.providerId ?? "community",
      category: CATEGORY_BY_DISCOVERY_KIND[discovery.kind],
      sourceUrl:
        discovery.githubUrl ?? discovery.sources[0]?.url ?? "",
      description: discovery.summary || undefined,
      tags: discovery.tags,
      confidence: discovery.confidence,
    });
    if (ok) {
      setMessage(`Recorded ${discovery.title} as a research source.`);
    }
  }

  function discoveryMeta(discovery: AIModelDiscovery, className: string) {
    return (
      <span className={className}>
        {DISCOVERY_KIND_LABELS[discovery.kind] ?? discovery.kind}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-1">AI Model Discovery</h2>
        <p className="text-sm text-[#71717a] mb-4">
          Discover AI models, providers, and related open-source projects with
          source provenance and confidence scoring. Metadata only; no code
          execution.
        </p>

        <form onSubmit={runDiscovery} className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-[#71717a]">
            <input
              type="checkbox"
              checked={includeGitHub}
              onChange={(e) => setIncludeGitHub(e.target.checked)}
              className="accent-[#6366f1]"
            />
            Include live GitHub open-source scan (uses GitHub API)
          </label>
          <button
            type="submit"
            disabled={running}
            className="bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {running ? "Discovering..." : "Run Discovery"}
          </button>
        </form>

        {message && <p className="text-sm text-[#818cf8] mt-3">{message}</p>}

        {discoveries.length > 0 && (
          <div className="divide-y divide-[#27272a] mt-4">
            {discoveries.map((discovery) => (
              <div
                key={discovery.id}
                className="py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {discovery.title}
                    </span>
                    {discoveryMeta(discovery, "text-[10px] text-[#818cf8] bg-[#6366f1]/10 px-1.5 py-0.5 rounded border border-[#6366f1]/20")}
                  </div>
                  {discovery.summary && (
                    <p className="text-sm text-[#71717a] line-clamp-2 mt-1">
                      {discovery.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-[#71717a]">
                    <span>Rank #{discovery.rank}</span>
                    <span>Score {discovery.score}</span>
                    <span>
                      Confidence {(discovery.confidence * 100).toFixed(0)}%
                    </span>
                    {discovery.repository && (
                      <span>★ {discovery.repository.stars}</span>
                    )}
                  </div>
                  {discovery.githubUrl && (
                    <a
                      href={discovery.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#818cf8] underline break-all mt-1 inline-block"
                    >
                      {discovery.githubUrl}
                    </a>
                  )}
                </div>
                <button
                  onClick={() => recordDiscovery(discovery)}
                  className="shrink-0 bg-[#22c55e]/10 hover:bg-[#22c55e]/20 text-green-400 border border-[#22c55e]/20 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  Research
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Search Discovered Models</h2>
        <form onSubmit={searchDiscoveries} className="flex flex-wrap gap-2 mb-3">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search discoveries..."
            className="flex-1 min-w-[160px] bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={searchKind}
            onChange={(e) => setSearchKind(e.target.value)}
            className="bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All kinds</option>
            {Object.entries(DISCOVERY_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Search
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="divide-y divide-[#27272a]">
            {searchResults.map((discovery) => (
              <div
                key={discovery.id}
                className="py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="font-medium text-sm">
                    {discovery.title}
                  </span>
                  <span className="text-xs text-[#71717a] ml-2">
                    {DISCOVERY_KIND_LABELS[discovery.kind] ?? discovery.kind} ·
                    score {discovery.score}
                  </span>
                  {discovery.githubUrl && (
                    <a
                      href={discovery.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-[#818cf8] underline mt-1 break-all"
                    >
                      {discovery.githubUrl}
                    </a>
                  )}
                </div>
                <button
                  onClick={() => recordDiscovery(discovery)}
                  className="shrink-0 bg-[#22c55e]/10 hover:bg-[#22c55e]/20 text-green-400 border border-[#22c55e]/20 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  Research
                </button>
              </div>
            ))}
          </div>
        )}
        {searchResults.length === 0 && (
          <p className="text-sm text-[#71717a]">No results yet.</p>
        )}
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Known AI Providers</h2>
        {providers.length === 0 ? (
          <p className="text-sm text-[#71717a]">Loading providers...</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <a
                key={provider.id}
                href={provider.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#818cf8] bg-[#6366f1]/10 border border-[#6366f1]/20 rounded-full px-3 py-1"
              >
                {provider.name}
                {provider.verified ? (
                  <span className="ml-1 text-green-400">✓</span>
                ) : (
                  <span className="ml-1 text-[#71717a]">?</span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Record a Model Discovery</h2>
        <form
          onSubmit={recordFromForm}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder="Model name"
            className="w-full bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            required
            maxLength={100}
            placeholder="Provider (e.g. openai, anthropic, community)"
            className="w-full bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            required
            type="url"
            placeholder="Source URL (official docs / release notes)"
            className="w-full bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm md:col-span-2"
          />
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm flex-1"
            >
              {Object.entries(MODEL_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={access}
              onChange={(e) => setAccess(e.target.value)}
              className="bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm"
            >
              <option value="api">API</option>
              <option value="open">Open</option>
              <option value="open-source">Open-source</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Optional description"
            className="w-full bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm md:col-span-2"
          />
          <button
            type="submit"
            className="md:col-span-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Record Model
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResearchPage() {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  async function loadJobs() {
    try {
      const res = await fetch("/api/research");
      if (res.ok) {
        setJobs(await res.json());
      }
    } catch {
      setJobs([]);
    }
  }

  useEffect(() => {
    loadJobs();
  }, [reloadKey]);

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, query, projectId }),
      });
      if (res.ok) {
        setTitle("");
        setQuery("");
        setProjectId("");
        setMessage("Research job created.");
        await loadJobs();
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ?? "Failed to create job");
      }
    } catch {
      setMessage("Failed to create job");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Research</h1>
        <p className="text-sm text-[#71717a] mt-1">
          Research job lifecycle, sources, and findings
        </p>
      </div>

      <form
        onSubmit={createJob}
        className="space-y-3 bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5"
      >
        <h2 className="text-lg font-semibold">Create Research Job</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-[#71717a]">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Research topic"
              className="w-full bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[#71717a]">Project ID</label>
            <input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              placeholder="project-123"
              className="w-full bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[#71717a]">Query</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            rows={2}
            placeholder="What do you want to research?"
            className="w-full bg-[#12121a] border border-[#27272a] rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {message && <p className="text-sm text-[#818cf8]">{message}</p>}
        <button
          type="submit"
          className="bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          Create Job
        </button>
      </form>

      <GitHubResearchSection
        onRecorded={() => setReloadKey((k) => k + 1)}
      />

      <ModelResearchSection
        onRecorded={() => setReloadKey((k) => k + 1)}
      />

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl">
        <div className="p-4 border-b border-[#27272a]">
          <h2 className="text-sm font-semibold">Research Jobs</h2>
        </div>
        {jobs.length === 0 ? (
          <div className="p-12 text-center text-[#71717a]">
            No research jobs yet. Create one above.
          </div>
        ) : (
          <div className="divide-y divide-[#27272a]">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-4 hover:bg-[#22223a] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={job.status} />
                    <span className="font-medium text-sm">{job.title}</span>
                  </div>
                  <span className="text-xs text-[#71717a]">
                    {new Date(job.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-[#71717a]">{job.query}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-[#71717a]">
                  <span>Priority: {job.priority}</span>
                  <span>Project: {job.projectId}</span>
                  <span>Created by: {job.createdBy}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
