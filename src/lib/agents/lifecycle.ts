import type { AgentDefinitionStatus } from "./types";
import { AgentRegistry } from "./registry";
import { validateAgentTransition, canTransitionAgent } from "./state";

export interface LifecycleResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly previousStatus?: AgentDefinitionStatus;
  readonly newStatus?: AgentDefinitionStatus;
}

export interface SuspensionState {
  readonly agentId: string;
  readonly suspendedAt: string;
  readonly reason: string;
  readonly checkpointId?: string;
}

const suspensionStates = new Map<string, SuspensionState>();

export function canAgentReceiveWork(status: AgentDefinitionStatus): boolean {
  return status === "active";
}

export function isAgentSuspended(status: AgentDefinitionStatus): boolean {
  return status === "suspended" || status === "paused";
}

export function isAgentRetired(status: AgentDefinitionStatus): boolean {
  return status === "retired";
}

export function isAgentAvailableForNewTasks(status: AgentDefinitionStatus): boolean {
  return status === "active";
}

export function suspendAgent(
  registry: AgentRegistry,
  agentId: string,
  reason: string,
  checkpointId?: string
): LifecycleResult {
  const def = registry.get(agentId);
  if (!def) return { ok: false, error: `unknown agent ${agentId}` };

  const validation = validateAgentTransition(def.status, "suspended");
  if (!validation.valid) return { ok: false, error: validation.error };

  if (def.status !== "active" && def.status !== "paused") {
    return { ok: false, error: `cannot suspend from ${def.status}` };
  }

  const success = registry.suspend(agentId);
  if (!success) return { ok: false, error: `suspend failed for ${agentId}` };

  suspensionStates.set(agentId, {
    agentId,
    suspendedAt: new Date().toISOString(),
    reason,
    checkpointId,
  });

  return { ok: true, previousStatus: def.status, newStatus: "suspended" };
}

export function resumeAgent(
  registry: AgentRegistry,
  agentId: string,
  version?: string
): LifecycleResult {
  const def = registry.get(agentId);
  if (!def) return { ok: false, error: `unknown agent ${agentId}` };

  const target = version ?? def.version;
  const validation = validateAgentTransition(def.status, "active");
  if (!validation.valid) return { ok: false, error: validation.error };

  if (def.status !== "suspended" && def.status !== "paused") {
    return { ok: false, error: `cannot resume from ${def.status}` };
  }

  const success = registry.activate(agentId, target);
  if (!success) return { ok: false, error: `resume failed for ${agentId}@${target}` };

  suspensionStates.delete(agentId);
  return { ok: true, previousStatus: def.status, newStatus: "active" };
}

export function pauseAgent(
  registry: AgentRegistry,
  agentId: string
): LifecycleResult {
  const def = registry.get(agentId);
  if (!def) return { ok: false, error: `unknown agent ${agentId}` };

  if (def.status !== "active") {
    return { ok: false, error: `cannot pause from ${def.status}` };
  }

  const validation = validateAgentTransition(def.status, "paused");
  if (!validation.valid) return { ok: false, error: validation.error };

  const success = registry.pause(agentId);
  if (!success) return { ok: false, error: `pause failed for ${agentId}` };

  suspensionStates.set(agentId, {
    agentId,
    suspendedAt: new Date().toISOString(),
    reason: "paused",
  });

  return { ok: true, previousStatus: def.status, newStatus: "paused" };
}

export function deprecateAgent(
  registry: AgentRegistry,
  agentId: string
): LifecycleResult {
  const def = registry.get(agentId);
  if (!def) return { ok: false, error: `unknown agent ${agentId}` };

  if (def.status === "retired" || def.status === "rejected") {
    return { ok: false, error: `cannot deprecate from ${def.status}` };
  }

  if (def.status === "suspended") {
    return { ok: false, error: "cannot deprecate suspended agent; resume or retire first" };
  }

  const success = registry.deprecate(agentId);
  if (!success) return { ok: false, error: `deprecate failed for ${agentId}` };

  return { ok: true, previousStatus: def.status, newStatus: "deprecated" };
}

export function retireAgent(
  registry: AgentRegistry,
  agentId: string
): LifecycleResult {
  const def = registry.get(agentId);
  if (!def) return { ok: false, error: `unknown agent ${agentId}` };

  if (def.status === "retired") {
    return { ok: false, error: "already retired" };
  }
  if (def.status === "rejected") {
    return { ok: false, error: "cannot retire rejected agent" };
  }
  if (def.status === "active" || def.status === "paused") {
    return { ok: false, error: `cannot retire directly from ${def.status}; suspend or deprecate first` };
  }

  const success = registry.retire(agentId);
  if (!success) return { ok: false, error: `retire failed for ${agentId}` };

  suspensionStates.delete(agentId);
  return { ok: true, previousStatus: def.status, newStatus: "retired" };
}

export function getSuspensionState(agentId: string): SuspensionState | undefined {
  return suspensionStates.get(agentId);
}

export function clearSuspensionState(agentId: string): void {
  suspensionStates.delete(agentId);
}

export function validateLifecycleTransition(
  from: AgentDefinitionStatus,
  to: AgentDefinitionStatus
): { valid: boolean; error?: string } {
  return validateAgentTransition(from, to);
}

export function getAgentLifecycleSummary(
  registry: AgentRegistry
): { active: number; suspended: number; deprecated: number; retired: number; total: number } {
  const all = registry.list();
  let active = 0;
  let suspended = 0;
  let deprecated = 0;
  let retired = 0;
  for (const def of all) {
    if (def.status === "active") active++;
    else if (def.status === "suspended" || def.status === "paused") suspended++;
    else if (def.status === "deprecated") deprecated++;
    else if (def.status === "retired") retired++;
  }
  return { active, suspended, deprecated, retired, total: all.length };
}

export { canTransitionAgent, validateAgentTransition };
