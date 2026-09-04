import { store } from "@/lib/store";

function PermissionRow({
  resource,
  action,
  effect,
}: {
  resource: string;
  action: string;
  effect: string;
}) {
  const effectColors: Record<string, string> = {
    allow: "bg-green-500/10 text-green-400 border-green-500/20",
    deny: "bg-red-500/10 text-red-400 border-red-500/20",
    ask: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  };

  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-[#22223a] rounded-lg">
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono text-[#a1a1aa]">
          {resource}
        </span>
        <span className="text-xs text-[#71717a]">.</span>
        <span className="text-sm font-mono text-[#a1a1aa]">
          {action}
        </span>
      </div>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${effectColors[effect]}`}
      >
        {effect}
      </span>
    </div>
  );
}

export default function SecurityPage() {
  const policy = store.getSecurityPolicy();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security Center</h1>
        <p className="text-sm text-[#71717a] mt-1">
          Manage security policies and permissions
        </p>
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{policy.name}</h2>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
              policy.enabled
                ? "bg-green-500/10 text-green-400 border-green-500/20"
                : "bg-gray-500/10 text-gray-400 border-gray-500/20"
            }`}
          >
            {policy.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <p className="text-sm text-[#a1a1aa] mb-4">
          {policy.description}
        </p>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-[#12121a] rounded-lg p-3">
            <span className="text-[#71717a]">Default Effect</span>
            <p className="font-medium mt-1 capitalize">
              {policy.defaultEffect}
            </p>
          </div>
          <div className="bg-[#12121a] rounded-lg p-3">
            <span className="text-[#71717a]">Self-Modification</span>
            <p className="font-medium mt-1 capitalize">
              {policy.selfModification}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl">
        <div className="p-4 border-b border-[#27272a]">
          <h2 className="text-sm font-semibold">Permissions</h2>
        </div>
        <div className="divide-y divide-[#27272a]">
          {policy.permissions.map((perm, i) => (
            <PermissionRow
              key={i}
              resource={perm.resource}
              action={perm.action}
              effect={perm.effect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
