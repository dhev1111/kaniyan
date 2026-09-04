import type { TaskDefinition, TaskState } from "./types";
import { validateTaskTransition } from "./state-machine";
import { eventBus } from "./events";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export class TaskQueue {
  private tasks: Map<string, TaskDefinition> = new Map();

  createTask(
    data: Omit<
      TaskDefinition,
      "id" | "state" | "retryCount" | "createdAt" | "updatedAt"
    >
  ): TaskDefinition {
    const task: TaskDefinition = {
      ...data,
      id: generateId(),
      state: "created",
      retryCount: 0,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.tasks.set(task.id, task);

    eventBus.emit("task.created", task.id, {
      projectId: task.projectId,
      title: task.title,
      priority: task.priority,
    });

    return task;
  }

  getTask(id: string): TaskDefinition | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): TaskDefinition[] {
    return Array.from(this.tasks.values());
  }

  getTasksByProject(projectId: string): TaskDefinition[] {
    return this.getAllTasks().filter((t) => t.projectId === projectId);
  }

  getTasksByState(state: TaskState): TaskDefinition[] {
    return this.getAllTasks().filter((t) => t.state === state);
  }

  getQueuedTasks(projectId?: string): TaskDefinition[] {
    return this.getTasksByState("queued").filter(
      (t) => !projectId || t.projectId === projectId
    );
  }

  transitionTask(
    id: string,
    newState: TaskState,
    extra?: { output?: string; error?: string; agentInstanceId?: string }
  ): { success: boolean; error?: string } {
    const task = this.tasks.get(id);
    if (!task) {
      return { success: false, error: `Task ${id} not found` };
    }

    const validation = validateTaskTransition(task.state, newState);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    task.state = newState;
    task.updatedAt = nowISO();

    if (extra?.output !== undefined) task.output = extra.output;
    if (extra?.error !== undefined) task.error = extra.error;
    if (extra?.agentInstanceId !== undefined) {
      task.assignedAgentInstanceId = extra.agentInstanceId;
    }

    if (newState === "running" && !task.startedAt) {
      task.startedAt = nowISO();
    }
    if (newState === "completed" || newState === "failed") {
      task.completedAt = nowISO();
    }

    const eventType = `task.${newState}` as const;
    if (
      [
        "queued",
        "assigned",
        "started",
        "completed",
        "failed",
        "retrying",
        "cancelled",
      ].includes(newState)
    ) {
      eventBus.emit(eventType, task.id, {
        projectId: task.projectId,
        title: task.title,
        agentInstanceId: task.assignedAgentInstanceId ?? "",
      });
    }

    return { success: true };
  }

  enqueueTask(id: string): { success: boolean; error?: string } {
    return this.transitionTask(id, "queued");
  }

  cancelTask(id: string): { success: boolean; error?: string } {
    return this.transitionTask(id, "cancelled");
  }

  failTask(
    id: string,
    error: string
  ): { success: boolean; error?: string } {
    return this.transitionTask(id, "failed", { error });
  }

  completeTask(
    id: string,
    output: string
  ): { success: boolean; error?: string } {
    return this.transitionTask(id, "completed", { output });
  }

  retryTask(id: string): { success: boolean; error?: string } {
    const task = this.tasks.get(id);
    if (!task) {
      return { success: false, error: `Task ${id} not found` };
    }
    if (task.retryCount >= task.maxRetries) {
      return {
        success: false,
        error: `Task ${id} has exhausted retries (${task.retryCount}/${task.maxRetries})`,
      };
    }

    task.retryCount += 1;
    task.updatedAt = nowISO();

    const result = this.transitionTask(id, "retrying");
    if (result.success) {
      eventBus.emit("task.retrying", task.id, {
        projectId: task.projectId,
        retryCount: String(task.retryCount),
        maxRetries: String(task.maxRetries),
      });
    }
    return result;
  }

  getFailedRetryableTasks(): TaskDefinition[] {
    return this.getAllTasks().filter(
      (t) => t.state === "failed" && t.retryCount < t.maxRetries
    );
  }
}

export const taskQueue = new TaskQueue();
