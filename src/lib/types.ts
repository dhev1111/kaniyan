export type ProjectStatus =
  | "idea"
  | "research"
  | "specification"
  | "architecture"
  | "development"
  | "testing"
  | "security"
  | "review"
  | "deployment"
  | "monitoring"
  | "archived";

export type Priority = "low" | "medium" | "high" | "critical";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  repositoryUrl?: string;
  workspacePath: string;
  memoryNamespace: string;
  ragNamespace: string;
  securityPolicy: string;
  deploymentConfig: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export type AgentStatus =
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "error"
  | "retrying";

export type AgentType =
  | "researcher"
  | "planner"
  | "product_manager"
  | "architect"
  | "coder"
  | "designer"
  | "tester"
  | "security_engineer"
  | "reviewer"
  | "devops_engineer"
  | "documenter"
  | "knowledge_agent"
  | "model_researcher"
  | "github_researcher"
  | "benchmark_agent"
  | "learning_agent";

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  status: AgentStatus;
  modelId?: string;
  projectId?: string;
  skills: string[];
  permissions: string[];
  maxConcurrentTasks: number;
  retryCount: number;
  maxRetries: number;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus =
  | "pending"
  | "queued"
  | "assigned"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

export interface Task {
  id: string;
  projectId: string;
  agentId?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  input?: string;
  output?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  dependencies: string[];
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AuditAction =
  | "project.create"
  | "project.update"
  | "project.delete"
  | "agent.create"
  | "agent.update"
  | "agent.start"
  | "agent.stop"
  | "agent.pause"
  | "task.create"
  | "task.assign"
  | "task.complete"
  | "task.fail"
  | "security.policy_change"
  | "security.permission_grant"
  | "security.permission_deny"
  | "system.startup"
  | "system.shutdown"
  | "system.self_modify";

export interface AuditEvent {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  actor: string;
  details: string;
  metadata: Record<string, string>;
  riskLevel: "low" | "medium" | "high" | "critical";
  timestamp: string;
}

export type PermissionAction = "allow" | "deny" | "ask";

export interface SecurityPermission {
  resource: string;
  action: string;
  effect: PermissionAction;
  conditions?: string[];
}

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  permissions: SecurityPermission[];
  defaultEffect: PermissionAction;
  selfModification: PermissionAction;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
