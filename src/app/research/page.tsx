"use client";

import { useEffect, useState } from "react";
import type { ResearchJob } from "@/lib/research/types";
import type { GitHubRepository, GitHubSearchResult } from "@/lib/research/github";

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
