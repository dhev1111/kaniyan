import { store } from "@/lib/store";
import {
  agentRegistry,
  orchestrator,
  eventBus,
} from "@/lib/control-plane";

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
      <p className="text-xs text-[#71717a] uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        colors[status] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"
      }`}
    >
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const stats = store.getStats();
  const instances = agentRegistry.getAllInstances();
  const runs = orchestrator.getAllRuns();
  const events = eventBus.getEvents(10);

  const runningInstances = instances.filter(
    (i) => i.state === "running"
  ).length;
  const readyInstances = instances.filter(
    (i) => i.state === "ready"
  ).length;
  const activeRuns = runs.filter(
    (r) => r.state === "running" || r.state === "pending"
  ).length;
  const completedRuns = runs.filter(
    (r) => r.state === "completed"
  ).length;
  const failedRuns = runs.filter((r) => r.state === "failed").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-[#71717a] mt-1">
          KANIYAN system overview
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Projects"
          value={stats.totalProjects}
          color="text-[#818cf8]"
        />
        <StatCard
          label="Agent Instances"
          value={instances.length}
          color="text-[#22c55e]"
        />
        <StatCard
          label="Active Runs"
          value={activeRuns}
          color="text-[#eab308]"
        />
        <StatCard
          label="Total Runs"
          value={runs.length}
          color="text-[#3b82f6]"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Ready Agents"
          value={readyInstances}
          color="text-[#06b6d4]"
        />
        <StatCard
          label="Running Agents"
          value={runningInstances}
          color="text-[#22c55e]"
        />
        <StatCard
          label="Completed Runs"
          value={completedRuns}
          color="text-[#22c55e]"
        />
        <StatCard
          label="Failed Runs"
          value={failedRuns}
          color="text-[#ef4444]"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Legacy Tasks"
          value={stats.totalTasks}
          color="text-[#a1a1aa]"
        />
        <StatCard
          label="Agent Definitions"
          value={agentRegistry.getAllDefinitions().length}
          color="text-[#818cf8]"
        />
        <StatCard
          label="Audit Events"
          value={stats.totalAuditEvents}
          color="text-[#3b82f6]"
        />
        <StatCard
          label="Control Events"
          value={eventBus.getEvents().length}
          color="text-[#06b6d4]"
        />
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl">
        <div className="p-4 border-b border-[#27272a]">
          <h2 className="text-sm font-semibold">
            Recent Control Plane Events
          </h2>
        </div>
        <div className="divide-y divide-[#27272a]">
          {events.length === 0 ? (
            <div className="p-4 text-sm text-[#71717a]">
              No control plane events yet. Submit tasks via the API to
              generate events.
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="p-4 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{event.type}</p>
                  <p className="text-xs text-[#71717a] mt-1">
                    Source: {event.source.slice(0, 16)} —{" "}
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={event.type.split(".")[0]} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
