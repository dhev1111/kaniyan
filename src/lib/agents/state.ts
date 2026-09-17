import type { AgentDefinitionStatus } from "./types";

const TRANSITIONS: Record<AgentDefinitionStatus, AgentDefinitionStatus[]> = {
  draft: ["validating"],
  validating: ["registered", "rejected"],
  registered: ["active", "rejected"],
  active: ["paused", "suspended", "deprecated"],
  paused: ["active", "deprecated"],
  suspended: ["active", "retired"],
  deprecated: ["retired"],
  retired: [],
  rejected: [],
};

export function validateAgentTransition(current: AgentDefinitionStatus, next: AgentDefinitionStatus): { valid: boolean; error?: string } {
  const allowed = TRANSITIONS[current] ?? [];
  if (allowed.includes(next)) {
    return { valid: true };
  }
  return { valid: false, error: `Invalid agent transition: ${current} → ${next}. Allowed: ${allowed.join(", ")}` };
}

export function canTransitionAgent(from: AgentDefinitionStatus, to: AgentDefinitionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedAgentTransitions(state: AgentDefinitionStatus): AgentDefinitionStatus[] {
  return TRANSITIONS[state] ?? [];
}

export function isPrivilegedTransition(current: AgentDefinitionStatus, next: AgentDefinitionStatus): boolean {
  const privilegedStates = ["active"];
  const privilegedTransitions: Record<AgentDefinitionStatus, string[]> = {
    draft: ["active"],
    validating: ["active"],
    registered: ["active"],
    rejected: ["active"],
    suspended: ["active"],
    retired: ["active"],
    deprecated: ["active"],
    active: [],
    paused: [],
  };
  return privilegedTransitions[current]?.includes(next) ?? false;
}
