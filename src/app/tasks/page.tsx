import { store } from "@/lib/store";
import { orchestrator } from "@/lib/control-plane";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    queued: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    assigned: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    running: "bg-green-500/10 text-green-400 border-green-500/20",
    paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    cancelled: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    retrying: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    created: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "no-status": "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? colors["no-status"]}`}
    >
      {status}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: "bg-blue-400",
    medium: "bg-yellow-400",
    high: "bg-orange-400",
    critical: "bg-red-400",
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[priority] ?? "bg-gray-400"}`}
    />
  );
}

export default function TasksPage() {
  const legacyTasks = store.getAllTasks();
  const runs = orchestrator.getAllRuns();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks & Runs</h1>
          <p className="text-sm text-[#71717a] mt-1">
            Control plane task queue and execution runs
          </p>
        </div>
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Active Runs</h2>
        <p className="text-sm text-[#71717a] mb-4">
          Currently executing or pending task runs.
        </p>
        {runs.length === 0 ? (
          <div className="text-sm text-[#71717a] py-4">
            No active runs. Submit tasks via the API to start execution.
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                className="bg-[#12121a] rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm font-mono">
                      {run.id.slice(0, 16)}
                    </span>
                    <StatusBadge status={run.state} />
                  </div>
                  <div className="text-xs text-[#71717a] mt-1 space-x-4">
                    <span>Task: {run.taskDefinitionId.slice(0, 12)}</span>
                    <span>
                      Agent: {run.agentInstanceId.slice(0, 12)}
                    </span>
                    <span>Attempt: {run.attemptNumber}</span>
                  </div>
                </div>
                <div className="text-xs text-[#71717a] text-right">
                  {run.durationMs !== undefined && (
                    <div>{run.durationMs}ms</div>
                  )}
                  <div>
                    {new Date(run.startedAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {legacyTasks.length > 0 && (
        <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3">
            Legacy Task Records
          </h2>
          <p className="text-sm text-[#71717a] mb-4">
            Pre-control-plane task records from Milestone 1.
          </p>
          <div className="space-y-2">
            {legacyTasks.map((task) => (
              <div
                key={task.id}
                className="bg-[#12121a] rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <PriorityDot priority={task.priority} />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{task.title}</h3>
                    <p className="text-xs text-[#71717a] mt-0.5 line-clamp-1">
                      {task.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <StatusBadge status={task.status} />
                  <span className="text-xs text-[#71717a]">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
