import type { AgentFactoryLimits } from "./types";

export const M8_LIMITS: AgentFactoryLimits = {
  maxActiveAgents: 50,
  maxAgentDepth: 5,
  maxAgentCreationPerProject: 20,
  maxAgentCreationPerRun: 10,
  maxAgentDependencyDepth: 5,
  maxTotalAgentTasks: 1000,
  maxAgentRetries: 3,
} as const;

export type M8Limits = typeof M8_LIMITS;
