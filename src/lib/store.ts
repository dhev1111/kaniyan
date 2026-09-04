import type {
  Project,
  Agent,
  Task,
  AuditEvent,
  SecurityPolicy,
} from "./types";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

const defaultSecurityPolicy: SecurityPolicy = {
  id: "default",
  name: "Default Security Policy",
  description:
    "Default security policy for KANIYAN. Denies dangerous permissions by default.",
  permissions: [
    { resource: "filesystem", action: "read", effect: "allow" },
    { resource: "filesystem", action: "write", effect: "ask" },
    { resource: "terminal", action: "execute", effect: "deny" },
    { resource: "browser", action: "public", effect: "ask" },
    { resource: "github", action: "read", effect: "allow" },
    { resource: "github", action: "write", effect: "ask" },
    { resource: "network", action: "request", effect: "ask" },
    { resource: "deployment", action: "execute", effect: "deny" },
    { resource: "secrets", action: "read", effect: "deny" },
    { resource: "self", action: "modify", effect: "deny" },
  ],
  defaultEffect: "deny",
  selfModification: "ask",
  enabled: true,
  createdAt: nowISO(),
  updatedAt: nowISO(),
};

class InMemoryStore {
  private projects: Map<string, Project> = new Map();
  private agents: Map<string, Agent> = new Map();
  private tasks: Map<string, Task> = new Map();
  private auditEvents: Map<string, AuditEvent> = new Map();
  private securityPolicy: SecurityPolicy = defaultSecurityPolicy;

  constructor() {
    this.seedData();
  }

  private seedData(): void {
    const demoProject: Project = {
      id: generateId(),
      name: "KANIYAN Core",
      description:
        "The core KANIYAN autonomous AI software factory system.",
      status: "development",
      priority: "high",
      workspacePath: "/workspace/kaniyan",
      memoryNamespace: "kaniyan-core",
      ragNamespace: "kaniyan-core",
      securityPolicy: "default",
      deploymentConfig: "default",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      tags: ["core", "ai", "factory"],
    };

    const demoAgent: Agent = {
      id: generateId(),
      name: "Planner",
      type: "planner",
      description: "Plans project architecture and task breakdowns.",
      status: "idle",
      projectId: demoProject.id,
      skills: ["project-planning", "task-breakdown"],
      permissions: ["filesystem.read", "github.read"],
      maxConcurrentTasks: 3,
      retryCount: 0,
      maxRetries: 3,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    const demoTask: Task = {
      id: generateId(),
      projectId: demoProject.id,
      agentId: demoAgent.id,
      title: "Design system architecture",
      description:
        "Create the initial architecture document for KANIYAN.",
      status: "completed",
      priority: "high",
      retryCount: 0,
      maxRetries: 3,
      dependencies: [],
      startedAt: nowISO(),
      completedAt: nowISO(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    this.projects.set(demoProject.id, demoProject);
    this.agents.set(demoAgent.id, demoAgent);
    this.tasks.set(demoTask.id, demoTask);
  }

  // Projects
  getAllProjects(): Project[] {
    return Array.from(this.projects.values());
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  createProject(
    data: Omit<Project, "id" | "createdAt" | "updatedAt">
  ): Project {
    const project: Project = {
      ...data,
      id: generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.projects.set(project.id, project);
    this.addAuditEvent({
      action: "project.create",
      entityType: "project",
      entityId: project.id,
      actor: "system",
      details: `Project "${project.name}" created`,
      metadata: {},
      riskLevel: "low",
    });
    return project;
  }

  updateProject(
    id: string,
    data: Partial<Project>
  ): Project | undefined {
    const existing = this.projects.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: nowISO() };
    this.projects.set(id, updated);
    return updated;
  }

  deleteProject(id: string): boolean {
    const existed = this.projects.has(id);
    this.projects.delete(id);
    if (existed) {
      this.addAuditEvent({
        action: "project.delete",
        entityType: "project",
        entityId: id,
        actor: "system",
        details: `Project ${id} deleted`,
        metadata: {},
        riskLevel: "medium",
      });
    }
    return existed;
  }

  // Agents
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  createAgent(
    data: Omit<Agent, "id" | "createdAt" | "updatedAt">
  ): Agent {
    const agent: Agent = {
      ...data,
      id: generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.agents.set(agent.id, agent);
    this.addAuditEvent({
      action: "agent.create",
      entityType: "agent",
      entityId: agent.id,
      actor: "system",
      details: `Agent "${agent.name}" created`,
      metadata: {},
      riskLevel: "low",
    });
    return agent;
  }

  updateAgent(id: string, data: Partial<Agent>): Agent | undefined {
    const existing = this.agents.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: nowISO() };
    this.agents.set(id, updated);
    return updated;
  }

  // Tasks
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getTasksByProject(projectId: string): Task[] {
    return this.getAllTasks().filter((t) => t.projectId === projectId);
  }

  getTasksByAgent(agentId: string): Task[] {
    return this.getAllTasks().filter((t) => t.agentId === agentId);
  }

  createTask(
    data: Omit<Task, "id" | "createdAt" | "updatedAt">
  ): Task {
    const task: Task = {
      ...data,
      id: generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.tasks.set(task.id, task);
    this.addAuditEvent({
      action: "task.create",
      entityType: "task",
      entityId: task.id,
      actor: "system",
      details: `Task "${task.title}" created`,
      metadata: {},
      riskLevel: "low",
    });
    return task;
  }

  updateTask(id: string, data: Partial<Task>): Task | undefined {
    const existing = this.tasks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: nowISO() };
    this.tasks.set(id, updated);
    return updated;
  }

  // Audit
  getAllAuditEvents(): AuditEvent[] {
    return Array.from(this.auditEvents.values()).sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  addAuditEvent(
    event: Omit<AuditEvent, "id" | "timestamp">
  ): AuditEvent {
    const auditEvent: AuditEvent = {
      ...event,
      id: generateId(),
      timestamp: nowISO(),
    };
    this.auditEvents.set(auditEvent.id, auditEvent);
    return auditEvent;
  }

  // Security
  getSecurityPolicy(): SecurityPolicy {
    return this.securityPolicy;
  }

  updateSecurityPolicy(
    data: Partial<SecurityPolicy>
  ): SecurityPolicy {
    this.securityPolicy = {
      ...this.securityPolicy,
      ...data,
      updatedAt: nowISO(),
    };
    return this.securityPolicy;
  }

  // Stats
  getStats() {
    const projects = this.getAllProjects();
    const agents = this.getAllAgents();
    const tasks = this.getAllTasks();
    const events = this.getAllAuditEvents();

    return {
      totalProjects: projects.length,
      activeProjects: projects.filter(
        (p) => p.status !== "archived"
      ).length,
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status === "running")
        .length,
      idleAgents: agents.filter((a) => a.status === "idle").length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === "completed")
        .length,
      runningTasks: tasks.filter((t) => t.status === "running")
        .length,
      failedTasks: tasks.filter((t) => t.status === "failed").length,
      pendingTasks: tasks.filter((t) => t.status === "pending")
        .length,
      totalAuditEvents: events.length,
      recentEvents: events.slice(0, 10),
    };
  }
}

export const store = new InMemoryStore();
