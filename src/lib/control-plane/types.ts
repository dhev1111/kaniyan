export type AgentState =
  | "registered"
  | "ready"
  | "starting"
  | "running"
  | "paused"
  | "resuming"
  | "completed"
  | "failed"
  | "retrying"
  | "stopped"
  | "cancelled";

export type TaskState =
  | "created"
  | "queued"
  | "assigned"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

export type RunState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  role: string;
  systemInstructions: string;
  skills: string[];
  allowedTools: string[];
  permissions: string[];
  modelPreference?: string;
  version: number;
  maxConcurrentTasks: number;
  maxRetries: number;
  retryDelayMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentInstance {
  id: string;
  definitionId: string;
  projectId?: string;
  state: AgentState;
  currentTaskId?: string;
  session?: AgentSession;
  retryCount: number;
  lastError?: string;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSession {
  id: string;
  agentInstanceId: string;
  startedAt: string;
  endedAt?: string;
  taskIds: string[];
  metadata: Record<string, string>;
}

export interface TaskDefinition {
  id: string;
  projectId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  state: TaskState;
  input?: string;
  output?: string;
  error?: string;
  assignedAgentInstanceId?: string;
  dependencies: string[];
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  taskDefinitionId: string;
  agentInstanceId: string;
  sessionId: string;
  state: RunState;
  input?: string;
  output?: string;
  error?: string;
  attemptNumber: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ControlPlaneEvent {
  id: string;
  type: ControlPlaneEventType;
  source: string;
  data: Record<string, string>;
  timestamp: string;
}

export type ControlPlaneEventType =
  | "agent.registered"
  | "agent.created"
  | "agent.ready"
  | "agent.starting"
  | "agent.started"
  | "agent.running"
  | "agent.paused"
  | "agent.resuming"
  | "agent.resumed"
  | "agent.completed"
  | "agent.failed"
  | "agent.stopped"
  | "agent.retrying"
  | "agent.cancelled"
  | "task.created"
  | "task.queued"
  | "task.assigned"
  | "task.started"
  | "task.running"
  | "task.paused"
  | "task.completed"
  | "task.failed"
  | "task.retrying"
  | "task.cancelled"
  | "run.started"
  | "run.completed"
  | "run.failed";

export interface RetryPolicy {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export interface ToolPermission {
  toolId: string;
  effect: "allow" | "deny" | "ask";
}

export interface AgentExecutorInput {
  taskDefinition: TaskDefinition;
  agentDefinition: AgentDefinition;
  session: AgentSession;
  run: Run;
}

export interface AgentExecutorOutput {
  success: boolean;
  output?: string;
  error?: string;
}

export interface AgentExecutor {
  execute(input: AgentExecutorInput): Promise<AgentExecutorOutput>;
}
