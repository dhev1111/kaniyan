"use client";

import { useEffect, useState } from "react";
import type { ResearchJob } from "@/lib/research/types";

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

export default function ResearchPage() {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState("");

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
  }, []);

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
