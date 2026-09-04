import { store } from "@/lib/store";

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        colors[level] || "bg-gray-500/10 text-gray-400 border-gray-500/20"
      }`}
    >
      {level}
    </span>
  );
}

export default function AuditPage() {
  const events = store.getAllAuditEvents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-[#71717a] mt-1">
          System activity and security events
        </p>
      </div>

      <div className="bg-[#1a1a2e] border border-[#27272a] rounded-xl">
        {events.length === 0 ? (
          <div className="p-12 text-center text-[#71717a]">
            No audit events recorded.
          </div>
        ) : (
          <div className="divide-y divide-[#27272a]">
            {events.map((event) => (
              <div
                key={event.id}
                className="p-4 hover:bg-[#22223a] transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {event.details}
                    </span>
                    <RiskBadge level={event.riskLevel} />
                  </div>
                  <span className="text-xs text-[#71717a]">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-[#71717a]">
                  <span className="font-mono">{event.action}</span>
                  <span>
                    Entity: {event.entityType}/{event.entityId.slice(0, 8)}
                  </span>
                  <span>Actor: {event.actor}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
