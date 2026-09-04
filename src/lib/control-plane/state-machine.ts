import type { AgentState, TaskState, RunState } from "./types";

const AGENT_TRANSITIONS: Record<AgentState, AgentState[]> = {
  registered: ["ready", "cancelled"],
  ready: ["starting", "cancelled"],
  starting: ["running", "failed"],
  running: ["paused", "completed", "failed", "stopped"],
  paused: ["resuming", "cancelled"],
  resuming: ["running", "failed"],
  completed: [],
  failed: ["retrying", "stopped", "cancelled"],
  retrying: ["running", "failed", "stopped", "cancelled"],
  stopped: [],
  cancelled: [],
};

const TASK_TRANSITIONS: Record<TaskState, TaskState[]> = {
  created: ["queued", "cancelled"],
  queued: ["assigned", "cancelled"],
  assigned: ["running", "cancelled"],
  running: ["paused", "completed", "failed", "cancelled"],
  paused: ["running", "cancelled"],
  completed: [],
  failed: ["retrying", "cancelled"],
  retrying: ["queued", "cancelled"],
  cancelled: [],
};

const RUN_TRANSITIONS: Record<RunState, RunState[]> = {
  pending: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionAgent(from: AgentState, to: AgentState): boolean {
  return AGENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionTask(from: TaskState, to: TaskState): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionRun(from: RunState, to: RunState): boolean {
  return RUN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateAgentTransition(
  from: AgentState,
  to: AgentState
): { valid: boolean; error?: string } {
  if (canTransitionAgent(from, to)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Invalid agent transition: ${from} → ${to}. Allowed: ${AGENT_TRANSITIONS[from].join(", ")}`,
  };
}

export function validateTaskTransition(
  from: TaskState,
  to: TaskState
): { valid: boolean; error?: string } {
  if (canTransitionTask(from, to)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Invalid task transition: ${from} → ${to}. Allowed: ${TASK_TRANSITIONS[from].join(", ")}`,
  };
}

export function validateRunTransition(
  from: RunState,
  to: RunState
): { valid: boolean; error?: string } {
  if (canTransitionRun(from, to)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Invalid run transition: ${from} → ${to}. Allowed: ${RUN_TRANSITIONS[from].join(", ")}`,
  };
}
