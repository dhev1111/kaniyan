import { store } from "@/lib/store";
import type { ProjectStatus, Priority } from "@/lib/types";

function StatusBadge({ status }: { status: ProjectStatus }) {
  const colors: Record<ProjectStatus, string> = {
    idea: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    research: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    specification: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    architecture: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    development: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    testing: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    security: "bg-red-500/10 text-red-400 border-red-500/20",
    review: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    deployment: "bg-green-500/10 text-green-400 border-green-500/20",
    monitoring: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    archived: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status]}`}
    >
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const colors: Record<Priority, string> = {
    low: "text-blue-400",
    medium: "text-yellow-400",
    high: "text-orange-400",
    critical: "text-red-400",
  };

  return (
    <span className={`text-xs font-medium ${colors[priority]}`}>
      {priority}
    </span>
  );
}

export default function ProjectsPage() {
  const projects = store.getAllProjects();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-[#71717a] mt-1">
            Manage autonomous software projects
          </p>
        </div>
        <button className="px-4 py-2 bg-[#6366f1] text-white text-sm font-medium rounded-lg hover:bg-[#818cf8] transition-colors">
          + New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-12 text-center">
          <p className="text-[#71717a]">No projects yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5 hover:border-[#6366f1]/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg">
                    {project.name}
                  </h3>
                  <p className="text-sm text-[#a1a1aa] mt-1 line-clamp-2">
                    {project.description}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <PriorityBadge priority={project.priority} />
                  <StatusBadge status={project.status} />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-[#71717a]">
                <span>Workspace: {project.workspacePath}</span>
                <span>Tags: {project.tags.join(", ")}</span>
                <span>
                  Updated: {new Date(project.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
