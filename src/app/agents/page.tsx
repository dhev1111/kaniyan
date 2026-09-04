import { store } from "@/lib/store";
import { agentRegistry } from "@/lib/control-plane";
import type { AgentState } from "@/lib/control-plane/types";

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: "bg-gray-400",
    running: "bg-green-400",
    paused: "bg-yellow-400",
    stopped: "bg-red-400",
    error: "bg-red-500",
    retrying: "bg-orange-400",
    registered: "bg-blue-400",
    ready: "bg-cyan-400",
    starting: "bg-blue-500",
    completed: "bg-emerald-400",
    failed: "bg-red-400",
    cancelled: "bg-gray-500",
    resuming: "bg-yellow-500",
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? "bg-gray-400"}`}
    />
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#6366f1]/10 text-[#818cf8] border border-[#6366f1]/20">
      {type}
    </span>
  );
}

function StateBadge({ state }: { state: AgentState }) {
  const colors: Record<AgentState, string> = {
    registered: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ready: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    starting: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    running: "bg-green-500/10 text-green-400 border-green-500/20",
    paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    resuming: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    retrying: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    stopped: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    cancelled: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[state]}`}
    >
      {state}
    </span>
  );
}

export default function AgentsPage() {
  const legacyAgents = store.getAllAgents();
  const definitions = agentRegistry.getAllDefinitions();
  const instances = agentRegistry.getAllInstances();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="text-sm text-[#71717a] mt-1">
          Agent definitions, instances, and control plane
        </p>
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Agent Definitions</h2>
        <p className="text-sm text-[#71717a] mb-4">
          Registered agent templates with roles, skills, and permissions.
        </p>
        {definitions.length === 0 ? (
          <div className="text-sm text-[#71717a] py-4">
            No agent definitions registered. Use the API to register
            definitions.
          </div>
        ) : (
          <div className="space-y-2">
            {definitions.map((def) => (
              <div
                key={def.id}
                className="bg-[#12121a] rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {def.name}
                    </span>
                    <TypeBadge type={def.role} />
                  </div>
                  <p className="text-xs text-[#71717a] mt-1">
                    {def.description}
                  </p>
                </div>
                <div className="text-xs text-[#71717a] text-right">
                  <div>v{def.version}</div>
                  <div>{def.skills.length} skills</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Agent Instances</h2>
        <p className="text-sm text-[#71717a] mb-4">
          Active agent instances spawned from definitions.
        </p>
        {instances.length === 0 ? (
          <div className="text-sm text-[#71717a] py-4">
            No agent instances spawned yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {instances.map((inst) => {
              const def = agentRegistry.getDefinition(inst.definitionId);
              return (
                <div
                  key={inst.id}
                  className="bg-[#12121a] rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StatusDot status={inst.state} />
                      <span className="font-medium text-sm">
                        {def?.name ?? inst.definitionId}
                      </span>
                    </div>
                    <StateBadge state={inst.state} />
                  </div>
                  <div className="text-xs text-[#71717a] space-y-1">
                    <div className="flex justify-between">
                      <span>Instance ID</span>
                      <span className="font-mono">
                        {inst.id.slice(0, 12)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Project</span>
                      <span>{inst.projectId ?? "none"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Retries</span>
                      <span>{inst.retryCount}</span>
                    </div>
                    {inst.currentTaskId && (
                      <div className="flex justify-between">
                        <span>Current Task</span>
                        <span className="font-mono">
                          {inst.currentTaskId.slice(0, 12)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {legacyAgents.length > 0 && (
        <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3">
            Legacy Agent Records
          </h2>
          <p className="text-sm text-[#71717a] mb-4">
            Pre-control-plane agent records from Milestone 1.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {legacyAgents.map((agent) => (
              <div
                key={agent.id}
                className="bg-[#12121a] rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <StatusDot status={agent.status} />
                    <span className="font-medium text-sm">
                      {agent.name}
                    </span>
                  </div>
                  <TypeBadge type={agent.type} />
                </div>
                <p className="text-xs text-[#71717a] line-clamp-2">
                  {agent.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
