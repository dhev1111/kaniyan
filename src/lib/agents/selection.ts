import type { AgentDefinition, CapabilityRequirement } from "./types";
import { AgentRegistry } from "./registry";

export interface SelectionResult {
  readonly matched: boolean;
  readonly agents: AgentDefinition[];
  readonly reason?: string;
}

export function selectAgents(
  goal: string,
  requirements: CapabilityRequirement[],
  registry: AgentRegistry
): SelectionResult {
  const capabilityMatch = registry.resolve(goal, requirements);
  if (capabilityMatch.length === 0) {
    return { matched: false, agents: [], reason: "no eligible agent found" };
  }

  const sorted = [...capabilityMatch].sort((a, b) => {
    const templateCompare = a.templateId.localeCompare(b.templateId);
    if (templateCompare !== 0) return templateCompare;
    const versionCompare = b.version.localeCompare(a.version);
    if (versionCompare !== 0) return versionCompare;
    return a.agentId.localeCompare(b.agentId);
  });

  return { matched: true, agents: sorted };
}
